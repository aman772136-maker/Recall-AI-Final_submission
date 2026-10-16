"use client";

import { Brain, RefreshCw, X } from "lucide-react";
import { useApp } from "@/store/AppStore";
import { MemoryList } from "@/components/chat/Message";
import { relativeTime } from "@/lib/time";

export function StudyContextPanel() {
  const { state, toggleContext, refreshContext, removeMemory } = useApp();
  const { items, note, loading, error } = state.context;

  const hasDemo = items.some((m) => m.source === "demo");

  return (
    <aside className="context" aria-label="Study context">
      <div className="context-head">
        <Brain size={16} style={{ color: "var(--accent-200)" }} />
        <h2>Study context</h2>
        <button
          type="button"
          className="icon-btn"
          data-quiet="true"
          onClick={() => void refreshContext()}
          aria-label="Refresh study context"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          data-quiet="true"
          onClick={() => toggleContext(false)}
          aria-label="Close study context"
        >
          <X size={15} />
        </button>
      </div>

      {note && <p className="context-note">{note}</p>}

      <div className="context-list scroll">
        {loading ? (
          <>
            <div className="skeleton" style={{ height: 64 }} />
            <div className="skeleton" style={{ height: 64 }} />
          </>
        ) : error ? (
          <p className="context-empty">
            Study context is unavailable right now. Chat still works normally.
          </p>
        ) : items.length === 0 ? (
          <p className="context-empty">
            Nothing remembered for this conversation yet. As you work, useful goals,
            topics and mistakes get recorded and shown here — with the reason they
            mattered.
          </p>
        ) : (
          <MemoryList items={items} onRemove={removeMemory} />
        )}
      </div>

      <div className="context-foot">
        {hasDemo && (
          <p style={{ marginBottom: 6 }}>
            <span className="badge-demo">demo</span> Items tagged demo are seeded
            sample data, not your real history.
          </p>
        )}
        <p>
          Memory is only ever added or removed by the backend. Nothing here is
          inferred in the browser, and removing an item asks the service to forget
          it.
        </p>
        {items.length > 0 && (
          <p style={{ marginTop: 6 }}>
            Last updated {relativeTime(items[0].updatedAt ?? new Date().toISOString())}
          </p>
        )}
      </div>
    </aside>
  );
}