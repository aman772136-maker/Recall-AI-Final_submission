import { Router } from "express";
import { z } from "zod";
import type { Attachment, ChatMessage, SendMessageRequest, SendMessageResponse, StudyMemory } from "@recallai/shared-types";
import type { StoredMessage } from "../types.js";
import type { Repository } from "../db/repository.js";
import type { AnswerProvider } from "../services/answer.js";
import { maybeRecordMemory, retrieveMemories } from "../services/memory.js";
import { asyncRoute, getUserId, HttpError, param } from "./helpers.js";

const sendSchema = z.object({
  content: z.string().max(20_000).default(""),
  attachmentIds: z.array(z.string()).max(12).default([]),
  responseMode: z.enum(["study", "deep-dive", "quiz"]).default("study"),
});

export function messagesRouter(repo: Repository, provider: AnswerProvider): Router {
  const r = Router();

  /** Shared turn logic. Returns the persisted user message. */
  async function beginTurn(conversationId: string, body: SendMessageRequest, userId?: string) {
    const conv = await repo.getConversation(conversationId);
    if (!conv) throw new HttpError(404, "not_found", "Conversation not found.");

    const attachments = (
      await Promise.all(body.attachmentIds.map((id) => repo.getAttachment(id)))
    ).filter((a): a is NonNullable<typeof a> => Boolean(a));

    // Only attachments the server actually finished reading are usable.
    const readyAttachments = await Promise.all(
      attachments.map(async (a) => {
        if (a.status !== "ready" || !a.extractedText) return null;
        return { attachment: a as never, text: a.extractedText };
      }),
    );

    const userMessage: StoredMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: body.content,
      createdAt: new Date().toISOString(),
      status: "complete",
      attachments: attachments.length ? (attachments as never) : undefined,
    };
    await repo.addMessage(userMessage);

    // Record a durable signal from the user's own words, if there is one.
    const recorded = await maybeRecordMemory(repo, {
      conversationId,
      messageId: userMessage.id,
      text: body.content,
      userId,
    });

    if (recorded) {
      console.log(`[api] Successfully recorded durable memory [${recorded.type}] for user ${userId || "default"}: "${recorded.summary.slice(0, 60)}"`);
    }

    // Derive a title from the first real question.
    if (conv.title === "New conversation") {
      const t = body.content.trim();
      if (t) {
        await repo.renameConversation(
          conversationId,
          t.slice(0, 46) + (t.length > 46 ? "…" : ""),
        );
      }
    }

    let { items, note } = await retrieveMemories(repo, body.content, 4, undefined, userId);

    // If a memory was just recorded this turn and not already in items, include it so the UI indicator shows the saved fact immediately
    if (recorded && !items.some((m) => m.id === recorded.id)) {
      items = [recorded, ...items];
      note = note || (recorded.type === "mistake" ? "Saved and anchored in your recorded mistake." : "Saved to your persistent study memory.");
    }

    console.log(`[api] Retrieved ${items.length} memories for query: "${body.content.slice(0, 40)}" (user: ${userId || "default"})`);

    const allMessages = await repo.listMessages(conversationId);
    const history = allMessages
      .filter((m) => m.id !== userMessage.id && m.status === "complete")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    return { conv, userMessage, attachments, readyAttachments, memories: items, note, history };
  }

  /* ------------------------------------------------------------------ */
  /* JSON fallback                                                       */
  /* ------------------------------------------------------------------ */

  r.post(
    "/:id/messages",
    asyncRoute(async (req, res) => {
      const body = sendSchema.parse(req.body) as SendMessageRequest;
      const turn = await beginTurn(param(req, "id"), body, getUserId(req));

      const messageId = crypto.randomUUID();
      const assistant: StoredMessage = {
        id: messageId,
        conversationId: param(req, "id"),
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        status: "streaming",
      };
      await repo.addMessage(assistant);

      let acc = "";
      for await (const piece of provider.stream(
        {
          content: body.content,
          responseMode: body.responseMode,
          attachments: turn.attachments as never,
          readyAttachments: turn.readyAttachments as never,
          memories: turn.memories,
          history: turn.history,
        },
        new AbortController().signal,
      )) {
        acc += piece;
      }

      await repo.updateMessage(messageId, { content: acc, status: "complete" });
      await repo.linkMemoriesToMessage(messageId, turn.memories.map((m) => m.id));
      if (turn.note) await repo.setContextNote(messageId, turn.note);

      const response: SendMessageResponse = {
        conversationId: param(req, "id"),
        userMessage: turn.userMessage,
        assistantMessage: {
          ...assistant,
          content: acc,
          status: "complete",
          studyContext: turn.memories.length ? turn.memories : undefined,
          contextNote: turn.note,
        },
      };
      res.json(response);
    }),
  );

  /* ------------------------------------------------------------------ */
  /* SSE stream                                                          */
  /* ------------------------------------------------------------------ */

  r.post("/:id/messages/stream", async (req, res) => {
    // SSE needs no buffering and no compression.
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");
    res.setHeader("x-accel-buffering", "no");
    res.flushHeaders?.();

    const controller = new AbortController();
    // `res`, not `req`: a request emits "close" as soon as its body has been
    // read, which would abort the generation before it starts. The response
    // closing is what actually means "the client went away".
    res.on("close", () => controller.abort());

    const send = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const body = sendSchema.parse(req.body) as SendMessageRequest;
      const turn = await beginTurn(param(req, "id"), body, getUserId(req));

      const messageId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await repo.addMessage({
        id: messageId,
        conversationId: param(req, "id"),
        role: "assistant",
        content: "",
        createdAt,
        status: "streaming",
      });

      send({ type: "message_start", messageId, createdAt });

      // Context arrives before the text, matching the documented event order.
      if (turn.memories.length) {
        send({ type: "context", messageId, items: turn.memories, note: turn.note });
      }

      let acc = "";
      for await (const piece of provider.stream(
        {
          content: body.content,
          responseMode: body.responseMode,
          attachments: turn.attachments as never,
          readyAttachments: turn.readyAttachments as never,
          memories: turn.memories,
          history: turn.history,
        },
        controller.signal,
      )) {
        acc += piece;
        send({ type: "delta", messageId, text: piece });
      }

      await repo.updateMessage(messageId, { content: acc, status: "complete" });
      await repo.linkMemoriesToMessage(messageId, turn.memories.map((m) => m.id));
      if (turn.note) await repo.setContextNote(messageId, turn.note);

      send({ type: "done", messageId });
    } catch (err) {
      if (controller.signal.aborted) {
        // Client went away mid-generation. Nothing to report.
      } else {
        const message =
          err instanceof Error ? err.message : "The answer could not be generated.";
        console.error("[api] stream error:", err);
        send({ type: "error", message });
      }
    } finally {
      res.end();
    }
  });

  return r;
}