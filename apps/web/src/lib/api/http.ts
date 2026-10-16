import type {
  Attachment,
  ChatMessage,
  Conversation,
  MessageFeedback,
  SendMessageRequest,
  SendMessageResponse,
  StudyContext,
} from "@recallai/shared-types";
import { ApiError, type RecallApi, type StreamHandlers } from "./types";

/**
 * Express transport. Route names here are the ones proposed in the spec —
 * if the backend settles on different paths, change them in this file only.
 */

/**
 * Consistent anonymous student identity for browser sessions.
 * Persists across page refreshes and new conversations in localStorage.
 */
export function getUserId(): string {
  if (typeof window === "undefined") return "default_student";
  const KEY = "recallai_user_id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = "user_" + (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12));
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "default_student";
  }
}

export class HttpApi implements RecallApi {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(
    path: string,
    init?: RequestInit & { signal?: AbortSignal },
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-user-id": getUserId(),
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new ApiError("Cannot reach the study service.", "network");
    }

    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new ApiError(
        detail?.error ?? `Request failed (${res.status}).`,
        res.status === 404 ? "not_found" : "server",
        res.status,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  listConversations(signal?: AbortSignal) {
    return this.request<Conversation[]>("/api/conversations", { signal });
  }
  createConversation() {
    return this.request<Conversation>("/api/conversations", { method: "POST" });
  }
  getConversation(id: string, signal?: AbortSignal) {
    return this.request<Conversation>(`/api/conversations/${id}`, { signal });
  }
  async getMessages(id: string, signal?: AbortSignal) {
    const res = await this.request<{ messages: ChatMessage[] }>(
      `/api/conversations/${id}`,
      { signal },
    );
    return res.messages;
  }
  renameConversation(id: string, title: string) {
    return this.request<Conversation>(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  }
  deleteConversation(id: string) {
    return this.request<void>(`/api/conversations/${id}`, { method: "DELETE" });
  }

  sendMessage(conversationId: string, body: SendMessageRequest) {
    return this.request<SendMessageResponse>(
      `/api/conversations/${conversationId}/messages`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  /**
   * Streams over SSE. The event names must match whatever the backend
   * documents — the UI handles exactly `message_start | delta | context |
   * done | error` and surfaces anything else as a protocol error rather
   * than guessing.
   */
  async streamMessage(
    conversationId: string,
    body: SendMessageRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ) {
    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl}/api/conversations/${conversationId}/messages/stream`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
            "x-user-id": getUserId(),
          },
          body: JSON.stringify(body),
          signal,
        },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new ApiError("Cannot reach the study service.", "network");
    }
    if (!res.ok || !res.body) {
      throw new ApiError(`Stream unavailable (${res.status}).`, "server", res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const raw = dataLine.slice(5).trim();
        if (!raw) continue;
        try {
          const event = JSON.parse(raw);
          switch (event.type) {
            case "message_start":
              handlers.onStart?.(event.messageId, event.createdAt);
              break;
            case "delta":
              handlers.onDelta?.(event.text);
              break;
            case "context":
              handlers.onContext?.(event.items, event.note);
              break;
            case "done":
              handlers.onDone?.();
              break;
            case "error":
              handlers.onError?.(event.message);
              break;
            default:
              throw new Error(`Unknown stream event: ${String(event.type)}`);
          }
        } catch (err) {
          handlers.onError?.(
            err instanceof Error ? err.message : "Malformed stream event.",
          );
          return;
        }
      }
    }
  }

  async uploadAttachment(file: File, onProgress: (pct: number) => void) {
    // XHR rather than fetch: upload progress events are required here.
    const form = new FormData();
    form.append("file", file);

    const record = await new Promise<Attachment>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}/api/uploads`);
      xhr.setRequestHeader("x-user-id", getUserId());
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as Attachment);
          } catch {
            reject(new ApiError("Upload response was unreadable.", "server"));
          }
        } else if (xhr.status === 413) {
          reject(new ApiError(`${file.name} is too large.`, "too_large", 413));
        } else if (xhr.status === 415) {
          reject(
            new ApiError(`${file.name} is not a supported file type.`, "unsupported_file", 415),
          );
        } else {
          reject(new ApiError(`Upload failed (${xhr.status}).`, "server", xhr.status));
        }
      });
      xhr.addEventListener("error", () =>
        reject(new ApiError("Upload failed: network error.", "network")),
      );
      xhr.send(form);
    });
    return { ...record, local: false };
  }

  removeAttachment(id: string) {
    return this.request<void>(`/api/uploads/${id}`, { method: "DELETE" });
  }

  getStudyContext(conversationId: string, signal?: AbortSignal) {
    return this.request<StudyContext>(`/api/conversations/${conversationId}/context`, {
      signal,
    });
  }

  removeMemory(id: string) {
    return this.request<void>(`/api/memories/${id}`, { method: "DELETE" });
  }

  submitFeedback(messageId: string, feedback: MessageFeedback) {
    return this.request<void>(`/api/messages/${messageId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    });
  }
}