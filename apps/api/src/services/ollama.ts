import type { AnswerProvider, AnswerRequest } from "./answer.js";
import { LocalAnswerProvider } from "./answer.js";
import { config } from "../config.js";

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatChunk {
  model?: string;
  created_at?: string;
  message?: {
    role?: string;
    content?: string;
  };
  done?: boolean;
}

/**
 * OllamaAnswerProvider
 *
 * Streams live local LLM responses from Ollama (e.g. Qwen 2.5 1.5B).
 * Incorporates FalkorDB graph-backed context, retrieved study memories,
 * extracted document text, and multi-turn conversation history.
 *
 * If Ollama is offline or not yet started, it gracefully falls back to
 * LocalAnswerProvider without crashing the request, and will automatically
 * pick up Ollama on the next request once Ollama is launched.
 */
export class OllamaAnswerProvider implements AnswerProvider {
  readonly name = "ollama";
  private readonly fallback = new LocalAnswerProvider();

  constructor(
    public readonly baseUrl = config.ollamaBaseUrl,
    public readonly model = config.ollamaModel,
    public readonly temperature = config.ollamaTemperature,
  ) {}

  /** Checks whether Ollama is reachable and whether the target model is installed. */
  async checkHealth(): Promise<{
    online: boolean;
    hasModel: boolean;
    models: string[];
    error?: string;
  }> {
    if (!config.ollamaEnabled) {
      return {
        online: false,
        hasModel: false,
        models: [],
        error: "Ollama disabled via OLLAMA_ENABLED=false",
      };
    }
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) {
        return {
          online: true,
          hasModel: false,
          models: [],
          error: `Ollama returned HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const modelList = (data.models ?? []).map((m) => m.name);
      const target = this.model.toLowerCase();
      const hasModel = modelList.some((m) => {
        const lower = m.toLowerCase();
        return (
          lower === target ||
          lower.startsWith(`${target}:`) ||
          target.startsWith(`${lower}:`) ||
          lower.includes(target)
        );
      });
      return { online: true, hasModel, models: modelList };
    } catch (err) {
      return {
        online: false,
        hasModel: false,
        models: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async *stream(req: AnswerRequest, signal: AbortSignal): AsyncGenerator<string, void, void> {
    if (!config.ollamaEnabled) {
      yield* this.fallback.stream(req, signal);
      return;
    }

    // Build the pedagogical prompt incorporating FalkorDB graph memory & attachments
    const memoryCount = req.memories?.length ?? 0;
    console.log(`[api/ollama] Building prompt with ${memoryCount} retrieved memories for mode=${req.responseMode}`);
    const messages = this.buildPrompt(req);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          options: {
            temperature: this.temperature,
          },
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn(
          `[api/ollama] Ollama responded with HTTP ${response.status} (${errorText || response.statusText}). Falling back to local provider.`,
        );
        yield* this.fallback.stream(req, signal);
        return;
      }

      if (!response.body) {
        throw new Error("No response body received from Ollama stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      try {
        while (true) {
          if (signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete chunk
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const chunk = JSON.parse(trimmed) as OllamaChatChunk;
              const content = chunk.message?.content;
              if (content) {
                yield content;
              }
              if (chunk.done) {
                return;
              }
            } catch {
              // Ignore partial JSON parse errors
            }
          }
        }

        // Process any remaining tail in buffer
        if (buffer.trim()) {
          try {
            const chunk = JSON.parse(buffer.trim()) as OllamaChatChunk;
            if (chunk.message?.content) yield chunk.message.content;
          } catch {
            // End of stream
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err: unknown) {
      if (signal.aborted) return;
      console.warn(
        `[api/ollama] Ollama stream failed (${err instanceof Error ? err.message : String(err)}). Falling back to local provider. (Run 'ollama run ${this.model}' to activate live local inference).`,
      );
      yield* this.fallback.stream(req, signal);
    }
  }

  private buildPrompt(req: AnswerRequest): OllamaChatMessage[] {
    const { content, responseMode, memories, readyAttachments, history } = req;

    let systemPrompt = [
      `You are RecallAI, an expert, rigorous, and encouraging academic study companion and tutor.`,
      `Your purpose is to build deep conceptual clarity, eliminate misconceptions, and adapt dynamically to what the student struggles with.`,
      ``,
      `### Formatting & Mathematical Notation:`,
      `- Use clean GitHub-flavored Markdown.`,
      `- For mathematical formulas and equations, ALWAYS use standard LaTeX / KaTeX:`,
      `  * Inline math: $...$ (e.g. $F = ma$, $\\lambda_i$)`,
      `  * Display/block math: $$...$$ (centered on its own lines)`,
      `- Structure responses with clear headers (###), concise explanations, and bullet points.`,
      `- Avoid hollow conversational preamble (do NOT say "Sure! Here is an explanation of..."). Jump straight into the pedagogical breakdown.`,
      ``,
      `### Response Mode Guidelines:`,
    ].join("\n");

    if (responseMode === "study") {
      systemPrompt += `\n- Mode: STUDY. First provide the physical or intuitive mental model. Then state the rigorous formal/mathematical principle. Then explicitly highlight the common mistake or cognitive trap students fall into.`;
    } else if (responseMode === "deep-dive") {
      systemPrompt += `\n- Mode: DEEP DIVE. Provide an exhaustive, rigorous breakdown. Explore underlying mechanics, formal derivations, edge cases where standard intuition fails, and connections to broader foundational theory.`;
    } else if (responseMode === "quiz") {
      systemPrompt += `\n- Mode: QUIZ. Formulate exactly 3 targeted diagnostic questions on the topic in increasing order of difficulty. Question 1: Core definition/mechanism without relying on buzzwords. Question 2: Intermediate application or small problem step-by-step. Question 3: Hard conceptual challenge or edge case where intuition breaks. Direct the student to answer in order.`;
    }

    if (memories && memories.length > 0) {
      systemPrompt += `\n\n### Student Context & Knowledge Graph (FalkorDB / Memory):\n`;
      systemPrompt += `The following items were retrieved from the student's durable study history. ALWAYS use these facts when answering personal or academic questions about the student:\n`;
      for (const m of memories) {
        const typeTag = m.type.toUpperCase();
        systemPrompt += `- [${typeTag}] "${m.label}": ${m.summary}\n`;
      }
      systemPrompt += `\nMemory guidelines:\n- Treat the retrieved memories above as verified, accurate facts about this student.\n- When the student asks what you remember, what their name is, or what they study, answer accurately using these retrieved facts.\n- When the student asks for recommendations or what to practise next, use their recorded mistakes and goals to provide targeted study guidance.\n- Never contradict retrieved memories.`;
    } else {
      systemPrompt += `\n\n### Memory Context:\nNo prior memories were retrieved for this query. If the student asks about personal facts or prior learning that you do not have in context or conversation history, politely state that you do not have that stored in memory yet. DO NOT fabricate or invent personal facts about the student.`;
    }

    if (readyAttachments && readyAttachments.length > 0) {
      systemPrompt += `\n\n### Student's Attached Notes / Material:\n`;
      systemPrompt += `The student attached the following study material. Use it directly to ground your explanations:\n`;
      for (const att of readyAttachments) {
        const textSample = att.text.slice(0, 3000);
        systemPrompt += `--- [Attachment: ${att.attachment.name}] ---\n${textSample}\n---\n`;
      }
    }

    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // Append prior conversational history if available
    if (history && history.length > 0) {
      for (const msg of history.slice(-8)) {
        if (msg.content.trim()) {
          messages.push({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          });
        }
      }
    }

    // Append current turn user prompt
    messages.push({
      role: "user",
      content: content.trim() || "Please explain this topic based on my attached notes and study context.",
    });

    return messages;
  }
}
