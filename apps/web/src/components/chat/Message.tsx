"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookMarked,
  ChevronDown,
  Copy,
  ListChecks,
  RotateCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import type { ChatMessage, StudyMemory } from "@recallai/shared-types";
import { useApp } from "@/store/AppStore";
import { Markdown } from "@/lib/markdown";
import { AttachmentPreview, ImagePreview } from "@/components/uploads/AttachmentPreview";

/* ------------------------------------------------------------------ */
/* Memory disclosure — "Used study context"                            */
/* ------------------------------------------------------------------ */

export function MemoryList({ items, onRemove }: { items: StudyMemory[]; onRemove?: (id: string) => void }) {
  return (
    <div className="context-list">
      {items.map((m) => (
        <div key={m.id} className="memory" data-type={m.type}>
          <div className="memory-top">
            <span className="tag" data-type={m.type}>{m.type.replace("_", " ")}</span>
            <span className="memory-when">{m.label}</span>
            {m.source === "demo" && <span className="badge-demo">demo</span>}
            <div style={{ flex: 1 }} />
            {onRemove && (
              <button
                type="button"
                className="icon-btn"
                data-quiet="true"
                style={{ width: 22, height: 22 }}
                aria-label={`Forget this ${m.type.replace("_", " ")}`}
                onClick={() => onRemove(m.id)}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <p className="memory-text">{m.summary}</p>
        </div>
      ))}
    </div>
  );
}

function ContextDisclosure({ message }: { message: ChatMessage }) {
  const { removeMemory } = useApp();
  if (!message.studyContext?.length) return null;

  return (
    <details className="context-disclosure">
      <summary>
        <Sparkles size={13} />
        Used {message.studyContext.length} piece
        {message.studyContext.length > 1 ? "s" : ""} of study context
        <ChevronDown className="chev" size={13} style={{ marginLeft: "auto" }} />
      </summary>
      <MemoryList items={message.studyContext} onRemove={removeMemory} />
      {message.contextNote && (
        <p style={{ padding: "0 11px 11px", fontSize: 12, lineHeight: 1.5, color: "var(--text-3)" }}>
          {message.contextNote}
        </p>
      )}
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function Actions({
  message,
  onStudyAction,
}: {
  message: ChatMessage;
  onStudyAction: (kind: string) => void;
}) {
  const { state, copyMessage, regenerate, rateMessage } = useApp();
  const [copied, setCopied] = useState(false);
  const rating = state.feedback[message.id];
  const busy = state.generation === "streaming" || state.generation === "submitting";

  return (
    <div className="msg-actions" data-pinned={rating !== undefined}>
      <button
        type="button"
        className="icon-btn"
        data-quiet="true"
        aria-label="Copy answer"
        title="Copy"
        onClick={() => {
          void copyMessage(message.content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? <BookMarked size={14} /> : <Copy size={14} />}
      </button>
      <button
        type="button"
        className="icon-btn"
        data-quiet="true"
        aria-label="Regenerate answer"
        title="Regenerate"
        disabled={busy}
        onClick={() => void regenerate(message.id)}
      >
        <RotateCw size={14} />
      </button>
      <button
        type="button"
        className="icon-btn"
        data-quiet="true"
        aria-label="Quiz me on this"
        title="Quiz me on this"
        disabled={busy}
        onClick={() => onStudyAction("quiz")}
      >
        <ListChecks size={14} />
      </button>
      <button
        type="button"
        className="icon-btn"
        data-quiet="true"
        aria-label="Explain more"
        title="Explain more"
        disabled={busy}
        onClick={() => onStudyAction("more")}
      >
        <Sparkles size={14} />
      </button>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        className="icon-btn"
        data-quiet="true"
        data-on={rating === "helpful"}
        aria-label="Mark as helpful"
        aria-pressed={rating === "helpful"}
        title="Helpful"
        onClick={() => void rateMessage(message.id, "helpful")}
      >
        <ThumbsUp size={14} />
      </button>
      <button
        type="button"
        className="icon-btn"
        data-quiet="true"
        data-on={rating === "not_helpful"}
        aria-label="Mark as not helpful"
        aria-pressed={rating === "not_helpful"}
        title="Not helpful"
        onClick={() => void rateMessage(message.id, "not_helpful")}
      >
        <ThumbsDown size={14} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export function Message({ message }: { message: ChatMessage }) {
  const { state, retry, setDraft, setResponseMode } = useApp();
  const isUser = message.role === "user";
  const streaming = message.status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [streaming, message.content]);

  const studyAction = (kind: string) => {
    if (kind === "quiz") {
      setResponseMode("quiz");
      setDraft("Quiz me on what you just explained.");
    } else {
      setResponseMode("deep-dive");
      setDraft("Go deeper on the second part of that answer.");
    }
  };

  return (
    <article className="msg" data-role={message.role}>
      <span className="msg-role">
        {isUser ? null : <Sparkles size={13} />}
        {isUser ? "You" : "RecallAI"}
      </span>

      {isUser ? (
        <div className="bubble">
          {message.content}
          {message.attachments?.length ? (
            <div className="tray" style={{ marginTop: 9 }}>
              {message.attachments.map((a) =>
                a.previewUrl ? (
                  <ImagePreview key={`${a.id}-${a.name}`} attachment={a} />
                ) : (
                  <AttachmentPreview key={`${a.id}-${a.name}`} attachment={a} />
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="bubble">
            {message.content ? (
              <>
                <Markdown text={message.content} />
                {streaming && <span className="cursor" aria-hidden="true" />}
              </>
            ) : streaming ? (
              <span className="cursor" aria-hidden="true" />
            ) : null}
          </div>

          {message.status === "error" && (
            <div className="msg-error" role="alert">
              <span>{message.error ?? "That answer did not complete."}</span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn"
                data-variant="ghost"
                disabled={state.generation === "streaming"}
                onClick={() => void retry(message.id)}
              >
                Retry
              </button>
            </div>
          )}

          {message.status === "interrupted" && (
            <div className="msg-error" role="status" style={{ background: "var(--glass-2)", borderColor: "var(--hairline-2)", color: "var(--text-2)" }}>
              <span>Stopped before this finished. The partial answer is kept.</span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn"
                data-variant="ghost"
                disabled={state.generation === "streaming"}
                onClick={() => void retry(message.id)}
              >
                Continue
              </button>
            </div>
          )}

          <ContextDisclosure message={message} />

          {message.status === "complete" && message.content && (
            <Actions message={message} onStudyAction={studyAction} />
          )}
        </>
      )}
    </article>
  );
}