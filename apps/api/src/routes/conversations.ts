import { Router } from "express";
import { z } from "zod";
import type { Repository } from "../db/repository.js";
import { asyncRoute, getUserId, HttpError, param } from "./helpers.js";

const titleSchema = z.object({ title: z.string().trim().min(1).max(120) });

export function conversationsRouter(repo: Repository): Router {
  const r = Router();

  r.get(
    "/",
    asyncRoute(async (req, res) => {
      res.json(await repo.listConversations(getUserId(req)));
    }),
  );

  r.post(
    "/",
    asyncRoute(async (req, res) => {
      res.status(201).json(await repo.createConversation(undefined, getUserId(req)));
    }),
  );

  r.get(
    "/:id",
    asyncRoute(async (req, res) => {
      const conv = await repo.getConversation(param(req, "id"));
      if (!conv) throw new HttpError(404, "not_found", "Conversation not found.");

      const messages = await repo.listMessages(conv.id);
      // Attach the plain-language reason each answer used its memories.
      for (const m of messages) {
        if (m.studyContext?.length) {
          m.contextNote = await repo.contextNoteForMessage(m.id);
        }
      }

      res.json({ ...conv, messages });
    }),
  );

  r.patch(
    "/:id",
    asyncRoute(async (req, res) => {
      const body = titleSchema.parse(req.body);
      const conv = await repo.renameConversation(param(req, "id"), body.title);
      if (!conv) throw new HttpError(404, "not_found", "Conversation not found.");
      res.json(conv);
    }),
  );

  r.delete(
    "/:id",
    asyncRoute(async (req, res) => {
      const ok = await repo.deleteConversation(param(req, "id"));
      if (!ok) throw new HttpError(404, "not_found", "Conversation not found.");
      res.status(204).end();
    }),
  );

  return r;
}