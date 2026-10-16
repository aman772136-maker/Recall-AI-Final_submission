/**
 * Shared contract between the RecallAI frontend and the future Node/Express API.
 * The browser must never contain database or LLM credentials — this package
 * describes shapes only, never secrets.
 */

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

export type AttachmentKind = "document" | "image";

export type AttachmentStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export interface Attachment {
  id?: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  status: AttachmentStatus;
  /** 0–100. Only meaningful while status is "uploading". */
  progress?: number;
  /** Object URL for local image thumbnails. Never sent to the API. */
  previewUrl?: string;
  /** True while the file exists only in the browser. */
  local?: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Conversations & messages                                            */
/* ------------------------------------------------------------------ */

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  preview?: string;
  /** True for the local draft created before the backend acknowledges it. */
  draft?: boolean;
}

export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus =
  | "sending"
  | "streaming"
  | "complete"
  | "error"
  /** Partial text survived a dropped stream; offer retry / regenerate. */
  | "interrupted";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  attachments?: Attachment[];
  status?: MessageStatus;
  /** Memory the backend actually used for this answer. Never invented. */
  studyContext?: StudyMemory[];
  /** Human-readable reason the context was relevant. */
  contextNote?: string;
  error?: string;
}

export type ResponseMode = "study" | "deep-dive" | "quiz";

export interface SendMessageRequest {
  content: string;
  attachmentIds: string[];
  responseMode: ResponseMode;
}

export interface SendMessageResponse {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

/* ------------------------------------------------------------------ */
/* Study memory (graph-backed context, surfaced in plain language)      */
/* ------------------------------------------------------------------ */

export type StudyMemoryType =
  | "goal"
  | "topic"
  | "mistake"
  | "preference"
  | "study_session";

/** Where a memory came from, so demo data is never shown as real history. */
export type StudyMemorySource = "learned" | "suggested" | "demo";

export interface StudyMemory {
  id: string;
  type: StudyMemoryType;
  label: string;
  summary: string;
  updatedAt?: string;
  source?: StudyMemorySource;
}

export interface StudyContext {
  items: StudyMemory[];
  /** One line explaining why these applied. Never raw graph internals. */
  note?: string;
  sourceMessageId?: string;
  loading: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Stream events (documented, not assumed)                             */
/* ------------------------------------------------------------------ */

/**
 * The frontend reads this shape only when the backend documents streaming.
 * Until then the JSON response path is used. Both paths end at the same
 * reducer actions, so swapping later touches one function.
 */
export type StreamEvent =
  | { type: "message_start"; messageId: string; createdAt: string }
  | { type: "delta"; messageId: string; text: string }
  | {
      type: "context";
      messageId: string;
      items: StudyMemory[];
      note?: string;
    }
  | { type: "done"; messageId: string }
  | { type: "error"; messageId: string; message: string };

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export type MessageFeedback = "helpful" | "not_helpful";

export interface Toast {
  id: string;
  tone: "success" | "error" | "info";
  message: string;
}

/* ------------------------------------------------------------------ */
/* Upload allowlist — single shared source of truth                    */
/* ------------------------------------------------------------------ */

export interface AllowedType {
  label: string;
  extensions: string[];
  mimeTypes: string[];
  kind: AttachmentKind;
  maxBytes: number;
}

/**
 * MVP allowlist. Only include formats the backend can actually process —
 * change this in one place when the API contract lands.
 */
export const ALLOWED_UPLOAD_TYPES: AllowedType[] = [
  {
    label: "PDF",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
    kind: "document",
    maxBytes: 20 * 1024 * 1024,
  },
  {
    label: "Text",
    extensions: [".txt", ".md"],
    mimeTypes: ["text/plain", "text/markdown"],
    kind: "document",
    maxBytes: 5 * 1024 * 1024,
  },
  {
    label: "Word",
    extensions: [".docx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    kind: "document",
    maxBytes: 20 * 1024 * 1024,
  },
  {
    label: "Image",
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    kind: "image",
    maxBytes: 10 * 1024 * 1024,
  },
];

export const MAX_ATTACHMENTS_PER_MESSAGE = 6;