"use client";

import { useEffect, useRef } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useApp } from "@/store/AppStore";
import { Message } from "./Message";

export function MessageList() {
  const { state, selectConversation } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  /**
   * Keep the latest message visible during streaming, unless the user has
   * deliberately scrolled upward — then leave them where they are.
   */
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distance < 120;
  };

  useEffect(() => {
    if (pinnedRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [state.messages, state.activeId]);

  if (state.messagesError) {
    return (
      <div className="messages scroll" ref={scrollRef}>
        <div className="messages-inner">
          <div className="msg-error" role="alert">
            <span>{state.messagesError}</span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn"
              data-variant="ghost"
              onClick={() => state.activeId && void selectConversation(state.activeId)}
            >
              <RefreshCw size={13} style={{ marginRight: 6 }} />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.messagesLoading) {
    return (
      <div className="messages" ref={scrollRef}>
        <div className="messages-inner">
          <div className="skeleton" style={{ height: 62 }} />
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 90 }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="messages scroll"
      ref={scrollRef}
      onScroll={onScroll}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Conversation"
    >
      <div className="messages-inner">
        {state.messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {state.generation === "submitting" && (
          <div className="msg" data-role="assistant">
            <span className="msg-role">
              <Sparkles size={13} /> RecallAI
            </span>
            <span className="cursor" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}