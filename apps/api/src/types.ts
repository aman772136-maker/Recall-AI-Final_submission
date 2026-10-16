import type {
  Attachment,
  ChatMessage,
  Conversation,
  MessageFeedback,
  StudyMemory,
} from "@recallai/shared-types";

/**
 * The shared contract ships browser-facing shapes only. A stored message also
 * needs the conversation it belongs to, which the browser never sends or reads,
 * so it is added here rather than polluting the shared type.
 */
export type StoredMessage = ChatMessage & { conversationId: string };

export type NewAttachment = Omit<Attachment, "id"> & {
  conversationId?: string;
  storagePath?: string;
};

export type AttachmentPatch = Partial<Pick<Attachment, "status">> & {
  /** `null` clears the column. */
  error?: string | null;
  extractedChars?: number;
  extractedText?: string;
  messageId?: string;
};

export type NewMemory = Omit<StudyMemory, "id"> & {
  conversationId?: string;
  messageId?: string;
  userId?: string;
  keywords: string[];
};

export type { Attachment, ChatMessage, Conversation, MessageFeedback, StudyMemory };