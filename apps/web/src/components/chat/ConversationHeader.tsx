"use client";

import { Brain, Menu, Pencil, Trash2 } from "lucide-react";
import { useApp } from "@/store/AppStore";

export function ConversationHeader() {
  const { state, toggleSidebar, toggleContext, renameConversation, deleteConversation } =
    useApp();

  const active = state.conversations.find((c) => c.id === state.activeId);
  const busy = state.generation === "streaming" || state.generation === "submitting";

  const status = busy
    ? { tone: "live", label: "Generating" }
    : state.generation === "error"
      ? { tone: "error", label: "Last answer failed" }
      : { tone: "idle", label: "Ready" };

  return (
    <header className="conv-header">
      <button
        type="button"
        className="icon-btn menu-btn"
        data-quiet="true"
        onClick={() => toggleSidebar(true)}
        aria-label="Open conversations"
      >
        <Menu size={17} />
      </button>

      <h1>{active?.title ?? "New conversation"}</h1>

      <span className="status-pill">
        <span className="dot" data-tone={status.tone} />
        {status.label}
      </span>

      <button
        type="button"
        className="icon-btn"
        data-quiet="true"
        onClick={() => toggleContext(!state.contextOpen)}
        aria-label="Study context"
        aria-pressed={state.contextOpen}
        title="Study context"
      >
        <Brain size={17} />
      </button>

      {active && (
        <>
          <button
            type="button"
            className="icon-btn"
            data-quiet="true"
            aria-label="Rename conversation"
            title="Rename"
            onClick={() => {
              const next = window.prompt("Rename conversation", active.title);
              if (next !== null) void renameConversation(active.id, next.trim());
            }}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            data-quiet="true"
            aria-label="Delete conversation"
            title="Delete"
            onClick={() => {
              const ok = window.confirm(
                `Delete “${active.title}”? This cannot be undone.`,
              );
              if (ok) void deleteConversation(active.id);
            }}
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </header>
  );
}