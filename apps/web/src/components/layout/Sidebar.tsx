"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Check,
  MessageSquare,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import type { Conversation } from "@recallai/shared-types";
import { useApp } from "@/store/AppStore";
import { groupByRecency, relativeTime } from "@/lib/time";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      style={{ width: size, height: size }}
      viewBox="0 0 34 34"
      aria-hidden="true"
    >
      <circle cx="17" cy="17" r="17" fill="var(--mark-ring)" />
      <circle cx="17" cy="17" r="8.6" fill="var(--mark-core)" />
      <circle cx="17" cy="17" r="3.7" fill="var(--mark-pupil)" />
    </svg>
  );
}

/** Click-outside + Escape handling for menus and dialogs. */
function useDismiss(open: boolean, close: () => void) {  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/**
 * Keeps Tab inside a modal dialog and returns focus to whatever opened it.
 * Both dialogs mount only while open, so mount/unmount is the trap lifetime.
 */
function useFocusTrap() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const focusables = [
        ...el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, []);
  return ref;
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

export function Sidebar() {
  const {
    state,
    newConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    setSearchQuery,
    toggleCollapsed,
    setTheme,
  } = useApp();

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Conversation | null>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [renameText, setRenameText] = useState("");

  const menuRef = useDismiss(menuFor !== null, () => setMenuFor(null));
  const settingsRef = useDismiss(settingsOpen, () => setSettingsOpen(false));

  const filtered = useMemo(() => {
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return state.conversations;
    return state.conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.preview ?? "").toLowerCase().includes(q),
    );
  }, [state.conversations, state.searchQuery]);

  const groups = useMemo(() => groupByRecency(filtered), [filtered]);
  const searching = state.searchQuery.trim().length > 0;

  return (
    <>
      <aside
        className="sidebar"
        data-collapsed={state.sidebarCollapsed && !state.sidebarOpen}
        data-open={state.sidebarOpen}
        aria-label="Conversations"
      >
        <div className="sidebar-top">
          <a className="brand" href="#" aria-label="RecallAI home">
            <BrandMark />
            <span className="brand-name">RecallAI</span>
          </a>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="icon-btn"
            data-quiet="true"
            onClick={toggleCollapsed}
            aria-label={state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <MessageSquare size={16} />
          </button>
        </div>

        <button
          type="button"
          className="new-chat"
          onClick={() => void newConversation()}
        >
          <Plus size={17} />
          <span>New conversation</span>
        </button>

        <div className="search">
          <Search className="s-icon" size={14} />
          <input
            type="search"
            value={state.searchQuery}
            placeholder="Search history"
            aria-label="Search conversations"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searching && (
            <button
              type="button"
              className="s-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="sidebar-body scroll">
          {state.conversationsLoading ? (
            <>
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </>
          ) : state.conversationsError ? (
            <div className="sidebar-empty">
              <p style={{ color: "var(--text-2)" }}>{state.conversationsError}</p>
              <button
                type="button"
                className="btn"
                data-variant="ghost"
                style={{ marginTop: 10, height: 32, fontSize: 12.5 }}
                onClick={() => void newConversation()}
              >
                Start a new conversation instead
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sidebar-empty">
              {state.conversations.length === 0
                ? "No conversations yet. Start one and ask a question — RecallAI carries useful learning context between sessions."
                : `Nothing matches “${state.searchQuery.trim()}”.`}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="group-label">{group.label}</p>
                {group.items.map((conv) => (
                  <div key={conv.id} className="conv" data-active={conv.id === state.activeId}>
                    <button
                      type="button"
                      className="conv-main"
                      onClick={() => void selectConversation(conv.id)}
                      aria-current={conv.id === state.activeId ? "page" : undefined}
                    >
                      <span className="conv-title">{conv.title}</span>
                      <span className="conv-preview">
                        {conv.preview || `Updated ${relativeTime(conv.updatedAt)}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="conv-menu"
                      data-open={menuFor === conv.id}
                      aria-label={`Options for ${conv.title}`}
                      aria-haspopup="menu"
                      onClick={() => setMenuFor(menuFor === conv.id ? null : conv.id)}
                    >
                      <MoreHorizontal size={15} />
                    </button>

                    {menuFor === conv.id && (
                      <div
                        className="menu"
                        role="menu"
                        ref={menuRef}
                        style={{ right: 4, top: "calc(100% - 2px)" }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuFor(null);
                            setRenaming(conv);
                            setRenameText(conv.title);
                          }}
                        >
                          <Pencil size={14} /> Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          data-danger="true"
                          onClick={() => {
                            setMenuFor(null);
                            setConfirmDelete(conv);
                          }}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}

          {searching && filtered.length > 0 && (
            <p className="sidebar-empty" style={{ paddingTop: 8, fontSize: 11 }}>
              Searching titles and previews. Full-text message search needs the
              backend.
            </p>
          )}
        </div>

        <div className="sidebar-foot" style={{ position: "relative" }}>
          <span className="avatar" aria-hidden="true">
            A
          </span>
          <div className="who">
            <div className="who-name">Local session</div>
            <div className="who-sub">No account connected</div>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-quiet="true"
            aria-label="Settings"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings size={16} />
          </button>

          {settingsOpen && (
            <div
              className="menu"
              role="menu"
              ref={settingsRef}
              style={{ right: 0, bottom: "calc(100% - 2px)" }}
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={state.theme === "dark"}
                className="menu-check"
                onClick={() => setTheme(state.theme === "dark" ? "light" : "dark")}
              >
                <span style={{ display: "inline-flex" }}>
                  {state.theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
                </span>
                {state.theme === "dark" ? "Dark" : "Light"}
                {state.theme === "dark" && <Check size={14} />}
              </button>
              <hr />
              <button type="button" role="menuitem" disabled style={{ opacity: 0.55 }}>
                <Sparkles size={14} /> Response style: study
              </button>
              <button type="button" role="menuitem" disabled style={{ opacity: 0.55 }}>
                <Brain size={14} /> Manage memories
              </button>
              <p style={{ padding: "4px 10px 6px", fontSize: 11, color: "var(--text-3)" }}>
                Account and memory management are not connected yet.
              </p>
            </div>
          )}
        </div>
      </aside>

      {renaming && (
        <RenameDialog
          value={renameText}
          onChange={setRenameText}
          onClose={() => setRenaming(null)}
          onSave={() => {
            void renameConversation(
              renaming.id,
              renameText.trim() || "Untitled conversation",
            );
            setRenaming(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${confirmDelete.title}”?`}
          body="This removes the conversation and its messages. It cannot be undone."
          confirmLabel="Delete"
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            void deleteConversation(id);
          }}
        />
)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

export function RenameDialog({
  value,
  onChange,
  onSave,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap();
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div
      className="dialog-veil"
      role="dialog"
      aria-modal="true"
      aria-label="Rename conversation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" ref={trapRef}>
        <h2>Rename conversation</h2>
        <p>Use a title you will recognise in the history list.</p>
        <input
          ref={ref}
          className="dialog-input"
          value={value}
          maxLength={80}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="dialog-actions">
          <button type="button" className="btn" data-variant="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" data-variant="solid" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const trapRef = useFocusTrap();
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="dialog-veil"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" ref={trapRef}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">
          <button type="button" className="btn" data-variant="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            ref={ref}
            type="button"
            className="btn"
            data-variant="danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}