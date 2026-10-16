"use client";

import { useState } from "react";
import {
  BrainCircuit,
  CalendarRange,
  HelpCircle,
  Lightbulb,
  Target,
} from "lucide-react";
import { useApp } from "@/store/AppStore";
import { USING_MOCK } from "@/lib/api";

const STARTERS = [
  {
    icon: HelpCircle,
    title: "Explain a concept step by step",
    sub: "Show the reasoning, then the abstraction",
    prompt: "Explain eigenvalues step by step, starting from what a matrix actually does to a vector.",
  },
  {
    icon: Lightbulb,
    title: "Help me understand a mistake",
    sub: "Bring a problem you keep getting wrong",
    prompt:
      "I keep applying F = ma without accounting for the net force and it breaks on ramps. Where exactly does my reasoning go wrong?",
  },
  {
    icon: Target,
    title: "Quiz me on a topic",
    sub: "Short questions, hardest last",
    prompt: "Quiz me on matrix decompositions — start with the basics and build up.",
  },
  {
    icon: CalendarRange,
    title: "Make a revision plan",
    sub: "Weighted to your weakest areas",
    prompt: "Make me a revision plan for a linear algebra exam in two weeks.",
  },
];

export function WelcomeScreen() {
  const { state, setDraft, setResponseMode, toggleContext } = useApp();
  const [started, setStarted] = useState(false);

  /**
   * A starter fills the composer and focuses it. It never sends silently —
   * the user keeps control of when the message goes.
   */
  const applyPrompt = (prompt: string) => {
    setDraft(prompt);
    setResponseMode(prompt.toLowerCase().startsWith("quiz") ? "quiz" : "study");
    setStarted(true);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>(".composer-textarea");
      el?.focus();
    });
  };

  const hasGoal = state.context.items.some((m) => m.type === "goal");

  return (
    <div className="welcome">
      <div className="welcome-inner rise">
        <h2>A study companion that remembers.</h2>
        <p>
          Ask a question or attach your notes. Goals, topics and recurring
          mistakes get recorded, and shape later answers.
        </p>

        <div className="starters">
          {hasGoal && !started && (
            <button
              type="button"
              className="starter starter-wide"
              onClick={() => applyPrompt("Where should I pick up next?")}
            >
              <BrainCircuit size={17} />
              <span className="starter-text">
                <span className="starter-title">Continue studying</span>
                <span className="starter-sub">
                  Picks up from your goal and what you last got wrong
                </span>
              </span>
            </button>
          )}
          {STARTERS.map((s) => (
            <button
              key={s.title}
              type="button"
              className="starter"
              onClick={() => applyPrompt(s.prompt)}
            >
              <s.icon size={17} />
              <span className="starter-text">
                <span className="starter-title">{s.title}</span>
                <span className="starter-sub">{s.sub}</span>
              </span>
            </button>
          ))}
        </div>

        {USING_MOCK && (
          <p className="demo-note">
            <strong>Sample data.</strong> Seeded conversations and the{" "}
            <span className="badge-demo">demo</span> memory are fixtures.{" "}
            <button
              type="button"
              onClick={() => toggleContext(true)}
              style={{ textDecoration: "underline", cursor: "pointer" }}
            >
              See what RecallAI remembers
            </button>
          </p>
        )}
      </div>
    </div>
  );
}