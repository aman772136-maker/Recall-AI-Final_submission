import type {
  Attachment,
  ResponseMode,
  StudyMemory,
} from "@recallai/shared-types";
import { config } from "../config.js";

/**
 * Answer generation.
 *
 * This is the swap point for a real model. The interface below is what the
 * routes depend on; `LocalAnswerProvider` is a deterministic implementation
 * used until an LLM is wired in server-side.
 *
 * Nothing in here runs in the browser, and no provider key ever leaves the
 * server process.
 */
export interface AnswerRequest {
  content: string;
  responseMode: ResponseMode;
  attachments: Attachment[];
  /** Attachments whose text extraction has completed. */
  readyAttachments: Array<{ attachment: Attachment; text: string }>;
  /** Memories retrieved for this turn. */
  memories: StudyMemory[];
  /** Prior conversation turns for multi-turn contextual continuity. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AnswerChunk {
  text: string;
}

export interface AnswerProvider {
  readonly name: string;
  /** Yields the answer incrementally so the SSE endpoint can stream it. */
  stream(req: AnswerRequest, signal: AbortSignal): AsyncGenerator<string, void, void>;
}

/**
 * The local provider. Deterministic, offline, and good enough to exercise the
 * full streaming path. It deliberately does not pretend to reason.
 */
export class LocalAnswerProvider implements AnswerProvider {
  readonly name = "local";

  async *stream(req: AnswerRequest, signal: AbortSignal) {
    const { content, responseMode, memories, readyAttachments } = req;
    const topic =
      content.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "").slice(0, 110) ||
      "that";

    const lead =
      responseMode === "quiz"
        ? `Three questions on **${topic}**, hardest last. Answer in order and I will mark them.`
        : responseMode === "deep-dive"
          ? `Going deeper on **${topic}**.`
          : `Breaking down **${topic}**.`;

    const body =
      responseMode === "quiz"
        ? [
            `1. State the definition in one sentence, without symbols.`,
            `2. Work a small numerical example and show every intermediate step.`,
            `3. Give one situation where the idea fails, and explain why.`,
          ].join("\n")
        : [
            `### What is actually happening`,
            ``,
            `The rule holds when you account for **every** force or term acting at once, not just the one you noticed first.`,
            ``,
            `1. Identify the pieces in the situation and write them down at the point they act.`,
            `2. Choose an axis. Along each axis, write down the sum.`,
            `3. Apply the relation with the sum, then substitute numbers.`,
            ``,
            `### The relation`,
            ``,
            `$$\\sum \\mathbf{F} = m\\mathbf{a} \\qquad (\\text{vector form})$$`,
            ``,
            `Solved for the quantity you usually want:`,
            ``,
            `$$\\mathbf{a} = \\frac{\\sum \\mathbf{F}}{m}$$`,
            ``,
            `The mass only scales how hard the sum has to be to change the motion. It never appears in the *direction* question.`,
            ``,
            `### The part people miss`,
            ``,
            `The step that goes wrong is treating "the quantity I can feel" as "the total". They differ exactly when there is more than one significant contribution, which is most real situations.`,
          ].join("\n");

    const contextNote = memories.length
      ? `\n\n---\n\nThis answer used ${memories.length} remembered item${memories.length > 1 ? "s" : ""}: ${memories
          .map((m) => `_${m.label.toLowerCase()}_`)
          .join(", ")}.`
      : "";

    const fromFiles = readyAttachments.length
      ? `\n\nI have text extracted from ${readyAttachments.length} attachment${
          readyAttachments.length > 1 ? "s" : ""
        } (${readyAttachments.map((a) => `_${a.attachment.name}_`).join(", ")}).`
      : "";

    const pending = req.attachments.filter((a) => a.status !== "ready");
    const pendingNote = pending.length
      ? `\n\n${pending.length} attachment${pending.length > 1 ? "s are" : " is"} still processing, so I have not used ${pending.length > 1 ? "them" : "it"} yet.`
      : "";

    for (const part of [lead, "\n\n", body, contextNote, fromFiles, pendingNote]) {
      if (signal.aborted) return;
      yield part;
      if (config.streamChunkDelayMs > 0) {
        await delay(config.streamChunkDelayMs, signal);
      }
    }
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}