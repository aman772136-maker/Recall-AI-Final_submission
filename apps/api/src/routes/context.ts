import { Router } from "express";
import { z } from "zod";
import type { StudyContext } from "@recallai/shared-types";
import type { Repository } from "../db/repository.js";
import { asyncRoute, getUserId, HttpError, param } from "./helpers.js";

/**
 * Study context.
 *
 * Returns the memories relevant to the most recent answer in the conversation,
 * plus the plain-language reason. If the backend has nothing, it says so — the
 * endpoint never manufactures an example memory for a real session.
 */
export function contextRouter(repo: Repository): Router {
  const r = Router();

  r.get(
    "/:id/context",
    asyncRoute(async (req, res) => {
      const conv = await repo.getConversation(param(req, "id"));
      if (!conv) throw new HttpError(404, "not_found", "Conversation not found.");

      const messages = await repo.listMessages(conv.id);

      // Walk back to the latest answer that actually used memory.
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i]!;
        if (m.role === "assistant" && m.studyContext?.length) {
          const payload: StudyContext & { items: StudyContext["items"] } = {
            items: m.studyContext,
            note: m.contextNote,
            sourceMessageId: m.id,
            loading: false,
          };
          res.json(payload);
          return;
        }
      }

      res.json({ items: [], loading: false } satisfies StudyContext);
    }),
  );

  /* Full memory list for the panel when no answer has context yet. */
  r.get(
    "/:id/memories",
    asyncRoute(async (req, res) => {
      const conv = await repo.getConversation(param(req, "id"));
      if (!conv) throw new HttpError(404, "not_found", "Conversation not found.");
      res.json(await repo.listMemories(conv.id, getUserId(req)));
    }),
  );

  return r;
}

import { falkorContext } from "../services/falkordb.js";

/**
 * Mounted at /api/memories, which is where the frontend looks. A memory is
 * addressable on its own, not only through a conversation.
 */
export function memoriesRouter(repo: Repository): Router {
  const r = Router();

  r.get(
    "/",
    asyncRoute(async (req, res) => {
      const userId = getUserId(req);
      if (falkorContext.isConnected) {
        const falkorMems = await falkorContext.listMemories(undefined, userId);
        if (falkorMems.length > 0) {
          res.json(falkorMems);
          return;
        }
      }
      res.json(await repo.listMemories(undefined, userId));
    }),
  );

  r.delete(
    "/:id",
    asyncRoute(async (req, res) => {
      const memoryId = param(req, "id");
      const ok = await repo.deleteMemory(memoryId);
      if (falkorContext.isConnected) {
        await falkorContext.deleteMemory(memoryId);
      }
      if (!ok) throw new HttpError(404, "not_found", "Memory not found.");
      res.status(204).end();
    }),
  );

  return r;
}

const feedbackSchema = z.object({
  feedback: z.enum(["helpful", "not_helpful"]),
});

export function feedbackRouter(repo: Repository): Router {
  const r = Router();

  r.post(
    "/:id/feedback",
    asyncRoute(async (req, res) => {
      const body = feedbackSchema.parse(req.body);
      await repo.setFeedback(param(req, "id"), body.feedback);
      res.status(204).end();
    }),
  );

  return r;
}