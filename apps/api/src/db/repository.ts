import type {
  Attachment,
  ChatMessage,
  Conversation,
  MessageFeedback,
  StudyMemory,
} from "@recallai/shared-types";
import type { AttachmentPatch, NewAttachment, NewMemory, StoredMessage } from "../types.js";

/**
 * All persistence goes through this interface. Two implementations:
 * PgRepository (Postgres/Neon) and MemoryRepository (no DATABASE_URL).
 *
 * Nothing above this layer knows which one is active, which is what keeps the
 * spec's "swap the backend without rewriting components" promise honest.
 */
export interface Repository {
  readonly kind: "postgres" | "memory";

  init(): Promise<void>;
  close(): Promise<void>;

  listConversations(userId?: string): Promise<Conversation[]>;
  createConversation(title?: string, userId?: string): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  renameConversation(id: string, title: string): Promise<Conversation | null>;
  deleteConversation(id: string): Promise<boolean>;

  listMessages(conversationId: string): Promise<ChatMessage[]>;
  addMessage(message: StoredMessage): Promise<StoredMessage>;
  updateMessage(
    id: string,
    value: Partial<Pick<ChatMessage, "content" | "status">> & { error?: string | null },
  ): Promise<void>;

  createAttachment(value: NewAttachment): Promise<Attachment>;
  updateAttachment(id: string, value: AttachmentPatch): Promise<void>;
  getAttachment(
    id: string,
  ): Promise<
    | (Attachment & { storagePath?: string; extractedText?: string; conversationId?: string })
    | null
  >;
  deleteAttachment(id: string): Promise<boolean>;
  listAttachments(conversationId: string): Promise<Attachment[]>;

  listMemories(conversationId?: string, userId?: string): Promise<StudyMemory[]>;
  upsertMemory(value: NewMemory): Promise<StudyMemory>;
  deleteMemory(id: string): Promise<boolean>;
  /** Memories whose keywords overlap the supplied set. */
  findMemoriesByKeywords(keywords: string[], limit: number, userId?: string): Promise<StudyMemory[]>;
  /** Bind memories to the answer that used them. */
  linkMemoriesToMessage(messageId: string, memoryIds: string[]): Promise<void>;
  memoriesForMessage(messageId: string): Promise<StudyMemory[]>;
  contextNoteForMessage(messageId: string): Promise<string | undefined>;
  setContextNote(messageId: string, note: string): Promise<void>;

  setFeedback(messageId: string, value: MessageFeedback): Promise<void>;
}

/** Word-level keys used for memory retrieval. */
export function keywordsOf(text: string): string[] {
  const stop = new Set([
    "the","a","an","and","or","of","to","in","on","for","with","is","are","was",
    "were","be","been","it","its","this","that","i","me","my","we","you","do",
    "does","did","how","what","why","when","where","which","can","could","would",
    "should","about","from","as","at","by","if","so","than","then","there","here",
    "not","no","yes","but","just","very","more","most","some","any","all",
  ]);

  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !stop.has(w)),
    ),
  ].slice(0, 32);
}