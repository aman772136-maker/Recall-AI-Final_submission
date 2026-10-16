"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useApp } from "@/store/AppStore";
import { Sidebar } from "./Sidebar";
import { ConversationHeader } from "@/components/chat/ConversationHeader";
import { WelcomeScreen } from "@/components/chat/WelcomeScreen";
import { MessageList } from "@/components/chat/MessageList";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { StudyContextPanel } from "@/components/study-context/StudyContextPanel";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_124724_bc041163-d651-425f-aea3-2acc1efc2c96.mp4";

/** Tracks whether the context panel is a drawer (needs a scrim). */
function useIsNarrow(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export function AppShell() {
  const { state, toggleSidebar, toggleContext, dismissToast } = useApp();
  const narrowContext = useIsNarrow("(max-width: 1100px)");

  const showWelcome = state.messages.length === 0 && !state.messagesLoading;

  return (
    <>
      <div className="stage" aria-hidden="true">
        <video className="stage-video" autoPlay muted loop playsInline preload="metadata" src={VIDEO_SRC} />
        <div className="stage-veil" />
      </div>

      <div className="shell">
        <Sidebar />

        <main className="main">
          <ConversationHeader />
          {showWelcome ? <WelcomeScreen /> : <MessageList />}
          <ChatComposer />
        </main>

        {state.contextOpen && <StudyContextPanel />}
      </div>

      {state.sidebarOpen && (
        <button
          type="button"
          className="scrim"
          aria-label="Close sidebar"
          style={{ zIndex: 44 }}
          onClick={() => toggleSidebar(false)}
        />
      )}

      {state.contextOpen && narrowContext && (
        <button
          type="button"
          className="scrim"
          aria-label="Close study context"
          style={{ zIndex: 44 }}
          onClick={() => toggleContext(false)}
        />
      )}

      {state.offline && (
        <div className="offline" role="status">
          <WifiOff size={14} />
          You are offline. Drafts are kept; sending resumes when you reconnect.
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {state.toasts.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone} onClick={() => dismissToast(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}