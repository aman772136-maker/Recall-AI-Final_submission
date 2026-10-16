"use client";

import {
  createContext,
  type Dispatch,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type {
  Attachment,
  ChatMessage,
  Conversation,
  MessageFeedback,
  ResponseMode,
  StudyContext as StudyContextData,
  StudyMemory,
  Toast,
} from "@recallai/shared-types";
import { ApiError, api } from "@/lib/api";
import {
  canAddMore,
  revokePreview,
  trackLocal,
  validateFile,
} from "@/lib/files";
import { toPlainText } from "@/lib/markdown";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export type GenerationStatus =
  | "idle"
  | "submitting"
  | "streaming"
  | "complete"
  | "error";

export interface AppState {
  /* App */
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  contextOpen: boolean;
  theme: "dark" | "light";
  offline: boolean;
  feedback: Record<string, MessageFeedback>;

  /* Conversation list */
  conversations: Conversation[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  searchQuery: string;

  /* Active conversation */
  activeId: string | null;
  messages: ChatMessage[];
  messagesLoading: boolean;
  messagesError: string | null;

  /* Composer */
  draftText: string;
  attachments: Attachment[];
  attachmentError: string | null;
  responseMode: ResponseMode;

  /* Generation */
  generation: GenerationStatus;
  activeMessageId: string | null;

  /* Study context */
  context: StudyContextData;

  toasts: Toast[];
}

const initialState: AppState = {
  sidebarOpen: false,
  sidebarCollapsed: false,
  contextOpen: false,
  theme: "dark",
  offline: false,
  feedback: {},

  conversations: [],
  conversationsLoading: true,
  conversationsError: null,
  searchQuery: "",

  activeId: null,
  messages: [],
  messagesLoading: false,
  messagesError: null,

  draftText: "",
  attachments: [],
  attachmentError: null,
  responseMode: "study",

  generation: "idle",
  activeMessageId: null,

  context: { items: [], loading: false },
  toasts: [],
};

type Action =
  | { type: "patch"; value: Partial<AppState> }
  | { type: "setConversations"; items: Conversation[] }
  | { type: "upsertConversation"; item: Conversation }
  | { type: "removeConversation"; id: string }
  | { type: "setMessages"; id: string; items: ChatMessage[] }
  | { type: "addMessage"; id: string; message: ChatMessage }
  | { type: "patchMessage"; id: string; messageId: string; value: Partial<ChatMessage> }
  | { type: "appendToMessage"; id: string; messageId: string; text: string }
  | { type: "setAttachments"; items: Attachment[] }
  | { type: "patchAttachment"; key: string; value: Partial<Attachment> }
  | { type: "dropAttachment"; key: string }
  | { type: "setContext"; value: Partial<StudyContextData> }
  | { type: "dropMemory"; id: string }
  | { type: "toast"; toast: Toast }
  | { type: "dismissToast"; id: string };

const attachmentKey = (a: Attachment) => `${a.name}:${a.size}:${a.id ?? "local"}`;

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.value };

    case "setConversations":
      return { ...state, conversations: action.items, conversationsLoading: false };

    case "upsertConversation": {
      const rest = state.conversations.filter((c) => c.id !== action.item.id);
      return {
        ...state,
        conversations: [action.item, ...rest].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        ),
      };
    }

    case "removeConversation": {
      const conversations = state.conversations.filter((c) => c.id !== action.id);
      const wasActive = state.activeId === action.id;
      return {
        ...state,
        conversations,
        activeId: wasActive ? (conversations[0]?.id ?? null) : state.activeId,
        messages: wasActive ? [] : state.messages,
        context: wasActive ? { items: [], loading: false } : state.context,
      };
    }

    case "setMessages":
      return {
        ...state,
        messages: action.id === state.activeId ? action.items : state.messages,
        messagesLoading: false,
      };

    case "addMessage":
      return state.activeId === action.id
        ? { ...state, messages: [...state.messages, action.message] }
        : state;

    case "patchMessage":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId ? { ...m, ...action.value } : m,
        ),
      };

    case "appendToMessage":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId
            ? { ...m, content: m.content + action.text }
            : m,
        ),
      };

    case "setAttachments":
      return { ...state, attachments: action.items };

    case "patchAttachment":
      return {
        ...state,
        attachments: state.attachments.map((a) =>
          attachmentKey(a) === action.key ? { ...a, ...action.value } : a,
        ),
      };

    case "dropAttachment": {
      const target = state.attachments.find((a) => attachmentKey(a) === action.key);
      if (target) revokePreview(target);
      return {
        ...state,
        attachments: state.attachments.filter((a) => attachmentKey(a) !== action.key),
      };
    }

    case "setContext":
      return { ...state, context: { ...state.context, ...action.value } };

    case "dropMemory":
      return {
        ...state,
        context: { ...state.context, items: state.context.items.filter((m) => m.id !== action.id) },
        messages: state.messages.map((m) =>
          m.studyContext
            ? { ...m, studyContext: m.studyContext.filter((x) => x.id !== action.id) }
            : m,
        ),
      };

    case "toast":
      return { ...state, toasts: [...state.toasts.slice(-2), action.toast] };

    case "dismissToast":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface AppApi {
  state: AppState;
  dispatch: Dispatch<Action>;

  newConversation(): Promise<void>;
  selectConversation(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  reloadConversations(): Promise<void>;
  setSearchQuery(q: string): void;
  toggleSidebar(v?: boolean): void;
  toggleCollapsed(): void;
  toggleContext(v?: boolean): void;
  setTheme(t: "dark" | "light"): void;

  setDraft(text: string): void;
  setResponseMode(mode: ResponseMode): void;
  addFiles(files: FileList | File[]): void;
  removeAttachment(attachment: Attachment): void;
  retryAttachment(attachment: Attachment): void;

  send(): Promise<void>;
  regenerate(messageId: string): Promise<void>;
  stop(): void;
  retry(messageId: string): Promise<void>;
  copyMessage(text: string): Promise<void>;
  rateMessage(messageId: string, value: MessageFeedback): Promise<void>;
  refreshContext(): Promise<void>;
  removeMemory(id: string): Promise<void>;
  dismissToast(id: string): void;
}

const Ctx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const filesRef = useRef(new Map<string, File>());
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ---------------- toasts ---------------- */
  const toast = useCallback((tone: Toast["tone"], message: string) => {
    const id = `t_${Math.random().toString(36).slice(2, 8)}`;
    dispatch({ type: "toast", toast: { id, tone, message } });
    setTimeout(() => dispatch({ type: "dismissToast", id }), 4200);
  }, []);

  /* ---------------- theme ---------------- */
  const setTheme = useCallback((theme: "dark" | "light") => {
    document.documentElement.dataset.theme = theme;
    dispatch({ type: "patch", value: { theme } });
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("recallai.theme");
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    setTheme(stored === "light" || stored === "dark" ? stored : prefersLight ? "light" : "dark");
  }, [setTheme]);

  /* ---------------- online / offline ---------------- */
  useEffect(() => {
    const on = () => dispatch({ type: "patch", value: { offline: false } });
    const off = () => dispatch({ type: "patch", value: { offline: true } });
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    dispatch({ type: "patch", value: { offline: !navigator.onLine } });
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  /* ---------------- conversations ---------------- */
  const reloadConversations = useCallback(async () => {
    dispatch({ type: "patch", value: { conversationsLoading: true } });
    try {
      const items = await api.listConversations();
      dispatch({ type: "setConversations", items });
      dispatch({ type: "patch", value: { conversationsError: null } });
    } catch (err) {
      dispatch({
        type: "patch",
        value: {
          conversationsLoading: false,
          conversationsError:
            err instanceof ApiError ? err.message : "Could not load your history.",
        },
      });
    }
  }, []);

  useEffect(() => {
    void reloadConversations();
  }, [reloadConversations]);

  /**
   * Hydrate messages for the active conversation. Covers the refresh-recovery
   * case in the spec: the id is known (persisted or deep-linked) but the
   * messages have not been fetched yet.
   */
  const hydrateActive = useCallback(async (id: string) => {
    dispatch({
      type: "patch",
      value: { activeId: id, messagesLoading: true, messagesError: null },
    });
    try {
      const items = await api.getMessages(id);
      dispatch({ type: "setMessages", id, items });
    } catch (err) {
      dispatch({
        type: "patch",
        value: {
          messagesLoading: false,
          messagesError:
            err instanceof ApiError ? err.message : "Could not open that conversation.",
        },
      });
    }
  }, []);

  /** Restore the most recent conversation when one is already known. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await api.listConversations();
        if (cancelled) return;
        dispatch({ type: "setConversations", items });
        const restored = window.localStorage.getItem("recallai.active");
        const target = items.find((c) => c.id === restored) ?? items[0];
        if (target && stateRef.current.activeId === null) {
          await hydrateActive(target.id);
        }
      } catch {
        /* the list call already surfaces its own error state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateActive]);

  /* Persist the selection so a reload returns to the same conversation. */
  useEffect(() => {
    if (state.activeId) window.localStorage.setItem("recallai.active", state.activeId);
  }, [state.activeId]);

  const newConversation = useCallback(async () => {
    if (stateRef.current.generation === "streaming" || stateRef.current.generation === "submitting") {
      toast("info", "Finish the current answer first.");
      return;
    }
    try {
      const conv = await api.createConversation();
      dispatch({ type: "upsertConversation", item: conv });
      dispatch({ type: "patch", value: { activeId: conv.id } });
      dispatch({ type: "setMessages", id: conv.id, items: [] });
      dispatch({ type: "setContext", value: { items: [], note: undefined, sourceMessageId: undefined } });
      dispatch({ type: "patch", value: { sidebarOpen: false } });
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : "Could not start a conversation.");
    }
  }, [toast]);

  const selectConversation = useCallback(
    async (id: string) => {
      if (id === stateRef.current.activeId) {
        dispatch({ type: "patch", value: { sidebarOpen: false } });
        return;
      }
      abortRef.current?.abort();
      dispatch({
        type: "patch",
        value: { activeId: id, messagesLoading: true, messagesError: null },
      });
      dispatch({ type: "setContext", value: { items: [], note: undefined, loading: true } });
      try {
        const items = await api.getMessages(id);
        dispatch({ type: "setMessages", id, items });
      } catch (err) {
        dispatch({
          type: "patch",
          value: {
            messagesLoading: false,
            messagesError: err instanceof ApiError ? err.message : "Could not open that conversation.",
          },
        });
      }
      dispatch({ type: "patch", value: { sidebarOpen: false } });
    },
    [],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const before = stateRef.current.conversations.find((c) => c.id === id);
      if (!before) return;
      // Optimistic: restore on failure.
      dispatch({ type: "upsertConversation", item: { ...before, title } });
      try {
        const updated = await api.renameConversation(id, title);
        dispatch({ type: "upsertConversation", item: updated });
        toast("success", "Renamed.");
      } catch (err) {
        dispatch({ type: "upsertConversation", item: before });
        toast("error", err instanceof ApiError ? err.message : "Rename failed.");
      }
    },
    [toast],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const before = stateRef.current.conversations;
      const activeMessages = stateRef.current.messages;
      dispatch({ type: "removeConversation", id });
      try {
        await api.deleteConversation(id);
        toast("success", "Conversation deleted.");
        const remaining = before.filter((c) => c.id !== id);
        if (stateRef.current.activeId && remaining.length > 0) {
          await selectConversation(stateRef.current.activeId);
        } else if (!stateRef.current.activeId && remaining.length > 0) {
          await selectConversation(remaining[0].id);
        }
      } catch (err) {
        dispatch({ type: "setConversations", items: before });
        if (stateRef.current.activeId) {
          dispatch({ type: "setMessages", id: stateRef.current.activeId, items: activeMessages });
        }
        toast("error", err instanceof ApiError ? err.message : "Delete failed.");
      }
    },
    [selectConversation, toast],
  );

  /* ---------------- attachments ---------------- */
  const runUpload = useCallback(
    async (record: Attachment, file: File) => {
      const key = `${record.name}:${record.size}`;
      dispatch({ type: "patchAttachment", key, value: { status: "uploading", progress: 0 } });
      try {
        const uploaded = await api.uploadAttachment(file, (pct) =>
          dispatch({ type: "patchAttachment", key, value: { progress: pct } }),
        );
        dispatch({
          type: "patchAttachment",
          key,
          value: { ...uploaded, local: false, status: "ready", progress: undefined },
        });
      } catch (err) {
        dispatch({
          type: "patchAttachment",
          key,
          value: {
            status: "failed",
            progress: undefined,
            error: err instanceof ApiError ? err.message : "Upload failed.",
          },
        });
      }
    },
    [],
  );

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const files = Array.from(incoming);
      const current = stateRef.current.attachments;
      const room = canAddMore(current.length);
      if (room) {
        dispatch({ type: "patch", value: { attachmentError: room } });
        return;
      }

      const accepted: Attachment[] = [];
      const errors: string[] = [];

      for (const file of files) {
        const problem = validateFile(file);
        if (problem) {
          errors.push(problem);
          continue;
        }
        if (current.length + accepted.length >= 6) {
          errors.push("You can attach up to 6 files per message.");
          break;
        }
        const record = trackLocal(file);
        filesRef.current.set(`${record.name}:${record.size}`, file);
        accepted.push(record);
      }

      if (accepted.length) {
        dispatch({ type: "setAttachments", items: [...current, ...accepted] });
        // Upload in the background; the user can keep typing.
        for (const record of accepted) {
          const file = filesRef.current.get(`${record.name}:${record.size}`);
          if (file) void runUpload(record, file);
        }
      }
      dispatch({ type: "patch", value: { attachmentError: errors[0] ?? null } });
    },
    [runUpload],
  );

  const retryAttachment = useCallback(
    (attachment: Attachment) => {
      const file = filesRef.current.get(`${attachment.name}:${attachment.size}`);
      if (!file) return;
      void runUpload(attachment, file);
      dispatch({
        type: "patchAttachment",
        key: attachmentKey(attachment),
        value: { error: undefined, status: "uploading", progress: 0 },
      });
    },
    [runUpload],
  );

  const removeAttachment = useCallback((attachment: Attachment) => {
    const id = attachment.id;
    dispatch({ type: "dropAttachment", key: attachmentKey(attachment) });
    filesRef.current.delete(`${attachment.name}:${attachment.size}`);
    if (id) void api.removeAttachment(id).catch(() => {});
  }, []);

  /* ---------------- sending ---------------- */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const id = stateRef.current.activeMessageId;
    if (id) {
      dispatch({
        type: "patchMessage",
        id: stateRef.current.activeId ?? "",
        messageId: id,
        value: { status: "interrupted" },
      });
    }
    dispatch({ type: "patch", value: { generation: "idle", activeMessageId: null } });
  }, []);

  const streamOnce = useCallback(
    async (conversationId: string, content: string) => {
      const ready = stateRef.current.attachments.filter((a) => a.status === "ready" && a.id);
      const pending = stateRef.current.attachments.filter((a) => a.status !== "ready");

      if (pending.length) {
        toast(
          "info",
          `${pending.length} attachment${pending.length > 1 ? "s are" : " is"} still processing. Send without ${pending.length > 1 ? "them" : "it"} or wait.`,
        );
      }

      const attachmentIds = ready.map((a) => a.id as string);

      // Optimistic user message so the round-trip feels instant.
      const optimistic: ChatMessage = {
        id: `local_${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
        status: "sending",
        attachments: ready.length ? ready : undefined,
      };
      dispatch({ type: "addMessage", id: conversationId, message: optimistic });

      const controller = new AbortController();
      abortRef.current = controller;

      let assistantId = "";

      try {
        await api.streamMessage(
          conversationId,
          { content, attachmentIds, responseMode: stateRef.current.responseMode },
          {
            onStart: (messageId, createdAt) => {
              assistantId = messageId;
              dispatch({ type: "addMessage", id: conversationId, message: {
                id: messageId,
                role: "assistant",
                content: "",
                createdAt,
                status: "streaming",
              }});
              dispatch({ type: "patchMessage", id: conversationId, messageId: optimistic.id, value: { status: "complete" } });
              dispatch({ type: "patch", value: { generation: "streaming", activeMessageId: messageId } });
            },
            onDelta: (text) => {
              if (assistantId) {
                dispatch({ type: "appendToMessage", id: conversationId, messageId: assistantId, text });
              }
            },
            onContext: (items, note) => {
              dispatch({ type: "setContext", value: { items, note, loading: false, sourceMessageId: assistantId } });
              if (assistantId) {
                dispatch({ type: "patchMessage", id: conversationId, messageId: assistantId, value: { studyContext: items, contextNote: note } });
              }
            },
            onDone: () => {
              if (assistantId) {
                dispatch({ type: "patchMessage", id: conversationId, messageId: assistantId, value: { status: "complete" } });
              }
              dispatch({ type: "patch", value: { generation: "complete", activeMessageId: null } });
            },
            onError: (message) => {
              toast("error", message);
            },
          },
          controller.signal,
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof ApiError ? err.message : "The answer could not be completed.";
        dispatch({
          type: "patchMessage",
          id: conversationId,
          messageId: assistantId || optimistic.id,
          value: { status: "error", error: message },
        });
        dispatch({ type: "patch", value: { generation: "error", activeMessageId: null } });
        toast("error", message);
      } finally {
        abortRef.current = null;
        dispatch({
          type: "patch",
          value: { draftText: "", attachments: [], attachmentError: null },
        });
        filesRef.current.clear();
      }
    },
    [toast],
  );

  const send = useCallback(async () => {
    const s = stateRef.current;
    const content = s.draftText.trim();
    if (!content && s.attachments.length === 0) return;
    if (s.generation === "submitting" || s.generation === "streaming") return;

    let id = s.activeId;
    if (!id) {
      dispatch({ type: "patch", value: { generation: "submitting" } });
      try {
        const conv = await api.createConversation();
        dispatch({ type: "upsertConversation", item: conv });
        dispatch({ type: "patch", value: { activeId: conv.id } });
        id = conv.id;
      } catch (err) {
        dispatch({ type: "patch", value: { generation: "idle" } });
        toast("error", err instanceof ApiError ? err.message : "Could not start a conversation.");
        return;
      }
    }

    dispatch({ type: "patch", value: { generation: "submitting" } });
    await streamOnce(id, content);
  }, [streamOnce, toast]);

  const regenerate = useCallback(
    async (messageId: string) => {
      const s = stateRef.current;
      if (!s.activeId || s.generation === "streaming") return;
      const index = s.messages.findIndex((m) => m.id === messageId);
      if (index <= 0) return;
      const prompt = [...s.messages.slice(0, index)].reverse().find((m) => m.role === "user");
      if (!prompt) return;
      dispatch({ type: "patch", value: { generation: "submitting" } });
      await streamOnce(s.activeId, prompt.content);
    },
    [streamOnce],
  );

  const retry = useCallback(
    async (messageId: string) => {
      const s = stateRef.current;
      if (!s.activeId) return;
      const index = s.messages.findIndex((m) => m.id === messageId);
      if (index <= 0) return;
      const prompt = [...s.messages.slice(0, index)].reverse().find((m) => m.role === "user");
      if (!prompt) return;
      // Remove the failed attempt, keep the prompt, then resend.
      dispatch({
        type: "patchMessage",
        id: s.activeId,
        messageId,
        value: { status: "complete", error: undefined, content: "" },
      });
      dispatch({ type: "patch", value: { generation: "submitting" } });
      await streamOnce(s.activeId, prompt.content);
    },
    [streamOnce],
  );

  /* ---------------- message actions ---------------- */
  const copyMessage = useCallback(
    async (text: string) => {
      const plain = toPlainText(text);
      try {
        await navigator.clipboard.writeText(plain);
        toast("success", "Copied to clipboard.");
      } catch {
        toast("error", "Clipboard access was blocked.");
      }
    },
    [toast],
  );

  const rateMessage = useCallback(
    async (messageId: string, value: MessageFeedback) => {
      const before = stateRef.current.feedback[messageId];
      dispatch({ type: "patch", value: { feedback: { ...stateRef.current.feedback, [messageId]: value } } });
      try {
        await api.submitFeedback(messageId, value);
      } catch {
        dispatch({ type: "patch", value: { feedback: { ...stateRef.current.feedback, [messageId]: before as MessageFeedback } } });
        toast("error", "Feedback could not be recorded.");
      }
    },
    [toast],
  );

  /* ---------------- study context ---------------- */
  const refreshContext = useCallback(async () => {
    const id = stateRef.current.activeId;
    if (!id) {
      dispatch({ type: "setContext", value: { items: [], loading: false } });
      return;
    }
    dispatch({ type: "setContext", value: { loading: true, error: undefined } });
    try {
      const ctx = await api.getStudyContext(id);
      dispatch({ type: "setContext", value: { ...ctx, loading: false } });
    } catch (err) {
      dispatch({
        type: "setContext",
        value: {
          loading: false,
          error: err instanceof ApiError ? err.message : "Study context is unavailable.",
        },
      });
    }
  }, []);

  useEffect(() => {
    if (state.activeId) void refreshContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeId]);

  const removeMemory = useCallback(
    async (id: string) => {
      const before = stateRef.current.context.items;
      dispatch({ type: "dropMemory", id });
      try {
        await api.removeMemory(id);
        toast("success", "Memory removed.");
      } catch {
        dispatch({ type: "setContext", value: { items: before } });
        toast("error", "That memory could not be removed.");
      }
    },
    [toast],
  );

  /* ---------------- simple setters ---------------- */
  const setDraft = useCallback((draftText: string) => {
    dispatch({ type: "patch", value: { draftText } });
  }, []);

  const setResponseMode = useCallback((responseMode: ResponseMode) => {
    dispatch({ type: "patch", value: { responseMode } });
  }, []);

  const setSearchQuery = useCallback((searchQuery: string) => {
    dispatch({ type: "patch", value: { searchQuery } });
  }, []);

  const toggleSidebar = useCallback((v?: boolean) => {
    dispatch({ type: "patch", value: { sidebarOpen: v ?? !stateRef.current.sidebarOpen } });
  }, []);

  const toggleCollapsed = useCallback(() => {
    dispatch({ type: "patch", value: { sidebarCollapsed: !stateRef.current.sidebarCollapsed } });
  }, []);

  const toggleContext = useCallback((v?: boolean) => {
    dispatch({ type: "patch", value: { contextOpen: v ?? !stateRef.current.contextOpen } });
  }, []);

  const dismissToast = useCallback((id: string) => {
    dispatch({ type: "dismissToast", id });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dispatch({ type: "patch", value: { sidebarOpen: false, contextOpen: false } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<AppApi>(
    () => ({
      state,
      dispatch,
      newConversation,
      selectConversation,
      renameConversation,
      deleteConversation,
      reloadConversations,
      setSearchQuery,
      toggleSidebar,
      toggleCollapsed,
      toggleContext,
      setTheme,
      setDraft,
      setResponseMode,
      addFiles,
      removeAttachment,
      retryAttachment,
      send,
      regenerate,
      stop,
      retry,
      copyMessage,
      rateMessage,
      refreshContext,
      removeMemory,
      dismissToast,
    }),
    [
      state,
      newConversation,
      selectConversation,
      renameConversation,
      deleteConversation,
      reloadConversations,
      setSearchQuery,
      toggleSidebar,
      toggleCollapsed,
      toggleContext,
      setTheme,
      setDraft,
      setResponseMode,
      addFiles,
      removeAttachment,
      retryAttachment,
      send,
      regenerate,
      stop,
      retry,
      copyMessage,
      rateMessage,
      refreshContext,
      removeMemory,
      dismissToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Re-export for components that only need the memory type. */
export type { StudyMemory };