"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Brain,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Paperclip,
  Square,
} from "lucide-react";
import type { ResponseMode } from "@recallai/shared-types";
import { useApp } from "@/store/AppStore";
import { AttachmentPreview } from "@/components/uploads/AttachmentPreview";

const MODES: Array<{ id: ResponseMode; label: string }> = [
  { id: "study", label: "Study" },
  { id: "deep-dive", label: "Deep dive" },
  { id: "quiz", label: "Quiz" },
];

const PLACEHOLDERS: Record<ResponseMode, string> = {
  study: "Ask a question, attach your notes, or say what you keep getting wrong…",
  "deep-dive": "What should I go deeper on? Name a topic or paste a section…",
  quiz: "Name a topic and I'll quiz you on it — hardest question last…",
};

const MODE_LABEL: Record<ResponseMode, string> = {
  study: "Study mode",
  "deep-dive": "Deep dive",
  quiz: "Quiz mode",
};

export function ChatComposer() {
  const {
    state,
    setDraft,
    setResponseMode,
    addFiles,
    removeAttachment,
    send,
    stop,
    newConversation,
    toggleContext,
  } = useApp();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const [modeOpen, setModeOpen] = useState(false);

  const busy = state.generation === "streaming" || state.generation === "submitting";
  const hasText = state.draftText.trim().length > 0;
  const hasAttachments = state.attachments.length > 0;
  const canSend = (hasText || hasAttachments) && !busy;

  /* Grow to a spacious height, then scroll internally. */
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 52), 240)}px`;
  }, []);

  useEffect(resize, [state.draftText, resize]);

  useEffect(() => {
    if (!state.messages.length) textareaRef.current?.focus();
  }, [state.messages.length]);

  useEffect(() => {
    if (!modeOpen) return;
    const close = () => setModeOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [modeOpen]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) void send();
    }
  };

  const pick = (input: React.RefObject<HTMLInputElement | null>) => {
    if (busy) return;
    input.current?.click();
  };

  const pickDoc = (f: FileList | null) => {
    if (f) addFiles(f);
    if (docRef.current) docRef.current.value = "";
  };
  const pickImg = (f: FileList | null) => {
    if (f) addFiles(f);
    if (imgRef.current) imgRef.current.value = "";
  };

  return (
    <form
      className="composer-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) void send();
      }}
    >
      <div className="composer">
        {state.attachments.length > 0 && (
          <div className="tray">
            {state.attachments.map((a) => (
              <AttachmentPreview
                key={`${a.id ?? "local"}-${a.name}-${a.size}`}
                attachment={a}
                onRemove={() => removeAttachment(a)}
              />
            ))}
          </div>
        )}

        {state.attachmentError && (
          <p className="tray-error" role="alert">
            {state.attachmentError}
            <button
              type="button"
              onClick={() => imgRef.current?.click()}
              style={{ marginLeft: 8, textDecoration: "underline", cursor: "pointer" }}
            >
              Pick another file
            </button>
          </p>
        )}

        <textarea
          ref={textareaRef}
          className="composer-textarea"
          rows={2}
          value={state.draftText}
          placeholder={PLACEHOLDERS[state.responseMode]}
          aria-label="Message RecallAI"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
        />

        <div className="tools">
          <div className="chips">
            <button
              type="button"
              className="chip"
              onClick={() => pick(docRef)}
              disabled={busy}
            >
              <FileText size={13} />
              <span>Attach notes</span>
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => pick(imgRef)}
              disabled={busy}
            >
              <ImageIcon size={13} />
              <span>Add photo</span>
            </button>
            <button
              type="button"
              className="chip"
              data-on={state.responseMode === "quiz"}
              onClick={() =>
                setResponseMode(state.responseMode === "quiz" ? "study" : "quiz")
              }
              disabled={busy}
            >
              <ListChecks size={13} />
              <span>Quiz me</span>
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => (state.activeId ? toggleContext(true) : void newConversation())}
              disabled={busy}
            >
              <Brain size={13} />
              <span>Study context</span>
            </button>
          </div>

          <div className="right">
            <div className="model-picker">
              <button
                type="button"
                className="model"
                aria-haspopup="menu"
                aria-expanded={modeOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setModeOpen((v) => !v);
                }}
                disabled={busy}
              >
                <span>{MODE_LABEL[state.responseMode]}</span>
                <ChevronDown
                  size={12}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>

              {modeOpen && (
                <div
                  className="menu composer-menu"
                  role="menu"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={state.responseMode === m.id}
                      className="menu-check"
                      onClick={() => {
                        setResponseMode(m.id);
                        setModeOpen(false);
                      }}
                    >
                      {m.label}
                      {state.responseMode === m.id && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              ref={docRef}
              type="file"
              hidden
              multiple
              onChange={(e) => pickDoc(e.target.files)}
            />
            <input
              ref={imgRef}
              type="file"
              hidden
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => pickImg(e.target.files)}
            />

            <div className="right-actions">
              <button
                type="button"
                className="attach"
                aria-label="Attach a document"
                title="Attach a document"
                onClick={() => pick(docRef)}
                disabled={busy}
              >
                <Paperclip size={16} strokeWidth={2} aria-hidden="true" />
              </button>

              {busy ? (
                <button
                  type="button"
                  className="send"
                  data-stop="true"
                  aria-label="Stop generating"
                  onClick={stop}
                >
                  <Square size={11} fill="currentColor" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="send"
                  aria-label="Send message"
                  disabled={!canSend}
                  data-ready={canSend}
                >
                  <ArrowUp size={16} strokeWidth={2.6} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="hint">
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
          {state.attachments.some((a) => a.status === "processing") && (
            <> · some attachments are still being processed</>
          )}
          {state.attachments.some((a) => a.status === "failed") && (
            <> · an attachment failed to upload</>
          )}
        </p>
      </div>
    </form>
  );
}