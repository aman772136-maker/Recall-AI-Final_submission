import type {
  Attachment,
  ChatMessage,
  Conversation,
  MessageFeedback,
  ResponseMode,
  SendMessageRequest,
  SendMessageResponse,
  StudyContext,
  StudyMemory,
} from "@recallai/shared-types";

/**
 * Every call the UI can make. Components never import a transport directly,
 * so switching from the mock to Express touches only `transport.ts`.
 */
export interface RecallApi {
  listConversations(signal?: AbortSignal): Promise<Conversation[]>;
  createConversation(): Promise<Conversation>;
  getConversation(id: string, signal?: AbortSignal): Promise<Conversation>;
  getMessages(id: string, signal?: AbortSignal): Promise<ChatMessage[]>;
  renameConversation(id: string, title: string): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  sendMessage(
    conversationId: string,
    body: SendMessageRequest,
  ): Promise<SendMessageResponse>;

  /** Server-sent deltas for one generation. Documented shape, not assumed. */
  streamMessage(
    conversationId: string,
    body: SendMessageRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<void>;

  uploadAttachment(file: File, onProgress: (pct: number) => void): Promise<Attachment>;
  removeAttachment(id: string): Promise<void>;

  getStudyContext(conversationId: string, signal?: AbortSignal): Promise<StudyContext>;
  removeMemory(id: string): Promise<void>;

  submitFeedback(messageId: string, feedback: MessageFeedback): Promise<void>;
  renameMemory?(id: string, summary: string): Promise<StudyMemory>;
}

export type StreamHandlers = {
  onStart?: (messageId: string, createdAt: string) => void;
  onDelta?: (text: string) => void;
  onContext?: (items: StudyMemory[], note?: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code:
      | "network"
      | "not_found"
      | "unsupported_file"
      | "too_large"
      | "server"
      | "conflict" = "server",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type { ResponseMode };