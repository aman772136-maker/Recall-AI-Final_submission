import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { PgRepository } from "./db/pg-repository.js";
import { MemoryRepository } from "./db/memory-repository.js";
import type { Repository } from "./db/repository.js";
import { LocalAnswerProvider } from "./services/answer.js";
import { OllamaAnswerProvider } from "./services/ollama.js";
import { conversationsRouter } from "./routes/conversations.js";
import { messagesRouter } from "./routes/messages.js";
import { uploadsRouter } from "./routes/uploads.js";
import { contextRouter, feedbackRouter, memoriesRouter } from "./routes/context.js";
import { errorHandler, notFound } from "./routes/helpers.js";
import { ensureDir } from "./services/files.js";

import { falkorContext } from "./services/falkordb.js";

function buildRepo(): Repository {
  return config.usingMemoryStore
    ? new MemoryRepository()
    : new PgRepository(config.databaseUrl);
}

export async function createApp() {
  const repo = buildRepo();
  await repo.init();
  await ensureDir(config.uploadDir);
  await falkorContext.init();

  // Ollama local LLM provider (qwen2.5:1.5b) with graceful auto-fallback
  const ollamaProvider = new OllamaAnswerProvider();
  const provider = ollamaProvider;

  const app = express();

  app.disable("x-powered-by");
  /*
   * CORS: with CORS_ORIGIN unset, local development reflects any localhost
   * origin so the web app works on whatever port it picked. In production the
   * origin list is required — no credentials are sent either way unless the
   * list is explicit.
   */
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !config.corsOrigins) {
    throw new Error("CORS_ORIGIN must be set in production.");
  }

  app.use(
    cors({
      origin: config.corsOrigins ?? /^https?:\/\/localhost(:\d+)?$/,
      credentials: Boolean(config.corsOrigins),
    }),
  );

  // Uploads use multipart and set their own limits; JSON gets a generous but
  // finite cap so a runaway body cannot exhaust memory.
  app.use(express.json({ limit: "2mb" }));

  if (config.logRequests) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  }

  app.get("/health", async (_req, res) => {
    const ollamaStatus = await ollamaProvider.checkHealth();
    res.json({
      ok: true,
      store: repo.kind,
      answerProvider: provider.name,
      ollama: {
        configuredModel: config.ollamaModel,
        baseUrl: config.ollamaBaseUrl,
        online: ollamaStatus.online,
        hasModel: ollamaStatus.hasModel,
        availableModels: ollamaStatus.models,
        status: ollamaStatus.online
          ? (ollamaStatus.hasModel ? "ready" : `model_${config.ollamaModel}_not_found`)
          : "offline_waiting_for_daemon",
      },
      contextStore: falkorContext.isConnected ? "falkordb" : "in-memory-fallback",
      falkorGraph: falkorContext.isConnected ? falkorContext.graphName : null,
      persistence: repo.kind === "postgres" ? "postgres" : "in-memory (set DATABASE_URL to persist)",
    });
  });

  app.use("/api/conversations", conversationsRouter(repo));
  app.use("/api/conversations", messagesRouter(repo, provider));
  app.use("/api/conversations", contextRouter(repo));
  app.use("/api/uploads", uploadsRouter(repo));
  app.use("/api/memories", memoriesRouter(repo));
  app.use("/api/messages", feedbackRouter(repo));

  app.use(notFound);
  app.use(errorHandler);

  return { app, repo };
}

const isMain = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");

if (isMain) {
  createApp()
    .then(async ({ app, repo }) => {
      const ollama = new OllamaAnswerProvider();
      const health = await ollama.checkHealth();
      app.listen(config.port, () => {
        console.log(`[api] RecallAI listening on http://localhost:${config.port}`);
        console.log(`[api] store: ${repo.kind}`);
        console.log(`[api] context: ${falkorContext.isConnected ? `falkordb ('${falkorContext.graphName}')` : "in-memory-fallback"}`);
        console.log(`[api] llm: ollama ('${config.ollamaModel}' at ${config.ollamaBaseUrl}) -> ${health.online ? (health.hasModel ? "READY" : "ONLINE (pull model: ollama run " + config.ollamaModel + ")") : "WAITING (start local daemon when ready: ollama run " + config.ollamaModel + ")"}`);
        if (repo.kind === "memory") {
          console.log("[api] DATABASE_URL is empty — history will not survive a restart.");
        }
      });
    })
    .catch((err) => {
      console.error("[api] failed to start:", err);
      process.exit(1);
    });
}