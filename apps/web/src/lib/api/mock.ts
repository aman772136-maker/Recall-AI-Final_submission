import {
  ALLOWED_UPLOAD_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type Attachment,
  type ChatMessage,
  type Conversation,
  type MessageFeedback,
  type SendMessageRequest,
  type SendMessageResponse,
  type StudyContext,
  type StudyMemory,
} from "@recallai/shared-types";
import { ApiError, type RecallApi, type StreamHandlers } from "./types";

/**
 * In-memory transport so the whole journey is demonstrable with no backend.
 * It mirrors the Express contract exactly; when `NEXT_PUBLIC_API_URL` is set,
 * `transport.ts` swaps in the HTTP client and nothing in the UI changes.
 */

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/* ------------------------------------------------------------------ */
/* Seeded demo data — clearly labelled as demo in the UI               */
/* ------------------------------------------------------------------ */

const SEED_MEMORIES: StudyMemory[] = [
  {
    id: "mem_goal_exam",
    type: "goal",
    label: "Current study goal",
    summary:
      "Revise for a linear-algebra exam in about two weeks, focusing on eigenvalues and matrix decompositions.",
    updatedAt: new Date(Date.now() - 864e5 * 2).toISOString(),
    source: "learned",
  },
  {
    id: "mem_topic_photons",
    type: "topic",
    label: "Recently studied topic",
    summary:
      "Worked through double-slit interference and photon momentum. Comfortable with the maths, still shaky on the intuition.",
    updatedAt: new Date(Date.now() - 864e5 * 5).toISOString(),
    source: "learned",
  },
  {
    id: "mem_mistake_newton",
    type: "mistake",
    label: "Recurring mistake",
    summary:
      "Repeatedly applies F = ma without the net-force qualifier, which breaks on inclined surfaces.",
    updatedAt: new Date(Date.now() - 864e5 * 9).toISOString(),
    source: "learned",
  },
  {
    id: "mem_pref_style",
    type: "preference",
    label: "How you like answers",
    summary:
      "Prefers worked examples before abstraction, and asks for the reasoning to be shown rather than asserted.",
    updatedAt: new Date(Date.now() - 864e5 * 11).toISOString(),
    source: "learned",
  },
  {
    id: "mem_session_mock",
    type: "study_session",
    label: "Sample session",
    summary:
      "Demo record. Forty minutes on matrix algebra, ending on SVD rather than eigen-decomposition.",
    updatedAt: new Date(Date.now() - 864e5 * 1).toISOString(),
    source: "demo",
  },
];

const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: "conv_newton",
    title: "Why does F = ma need “net”?",
    updatedAt: new Date(Date.now() - 3600e3 * 2).toISOString(),
    preview: "I get it on a flat surface, but not on a ramp.",
  },
  {
    id: "conv_eigen",
    title: "Eigenvalues, step by step",
    updatedAt: new Date(Date.now() - 864e5).toISOString(),
    preview: "Starting from Av = λv and working outward.",
  },
  {
    id: "conv_plan",
    title: "Revision plan before the exam",
    updatedAt: new Date(Date.now() - 864e5 * 6).toISOString(),
    preview: "Two weeks out, mostly matrix decompositions.",
  },
];

const SEED_MESSAGES: Record<string, ChatMessage[]> = {
  conv_newton: [
    {
      id: "m_n1",
      role: "user",
      content:
        "I get F = ma on a flat surface, but it falls apart the moment there is a ramp. Why does the “net” matter?",
      createdAt: new Date(Date.now() - 3600e3 * 2).toISOString(),
      status: "complete",
    },
    {
      id: "m_n2",
      role: "assistant",
      content: `Newton's second law is about what the object **actually experiences**, not about a force you happen to have drawn on it.

### The distinction
- $\\mathbf{F}$ is the vector sum of every force in the world at that instant.
- $m\\mathbf{a}$ is the result of that sum. It is not an extra term you get to choose.

On flat ground the two forces you normally name cancel:

1. Gravity pulls down with $mg$.
2. The floor pushes back with $N$.
3. Horizontally nothing acts, so the net horizontal force is zero.

On a ramp the floor no longer pushes straight up, so it has no component opposing the part of gravity that runs down the slope.

| Situation | Along the slope |
| --- | --- |
| Flat floor | $F_{\\text{net}} = 0 \\Rightarrow a = 0$ |
| Ramp at angle $\\theta$ | $F_{\\text{net}} = mg\\sin\\theta$ |

In general:
$$\\sum \\mathbf{F} = m\\mathbf{a} \\qquad \\text{(vector form)}$$

That $mg\\sin\\theta$ is the whole story. Mass does not rescue you; the *direction* of the normal force does.

> The failure mode is not arithmetic. It is treating "the force I feel from the ground" as "the net force".`,
      createdAt: new Date(Date.now() - 3600e3 * 2).toISOString(),
      status: "complete",
      studyContext: [SEED_MEMORIES[2]],
      contextNote:
        "We used a mistake you hit before: applying F = ma without accounting for the net force on an inclined surface.",
    },
  ],
  conv_eigen: [
    {
      id: "m_e1",
      role: "user",
      content: "Explain eigenvalues from scratch. I have never done matrix algebra properly.",
      createdAt: new Date(Date.now() - 864e5).toISOString(),
      status: "complete",
    },
    {
      id: "m_e2",
      role: "assistant",
      content: `An eigenvalue is just a stretch factor that some directions refuse to feel.

### The mechanism
Take a matrix $A$ and a vector $v$. Most vectors get rotated, scaled, or both. A few special ones get **scaled and nothing else** — those directions are what eigenvectors are.

1. Assume the fixed-point condition:
   $$Av = \\lambda v$$
2. Move everything to one side:
   $$(A - \\lambda I)v = 0$$
3. Non-trivial solutions exist only when the matrix is singular:
   $$\\det(A - \\lambda I) = 0$$

Step 3 is the whole exercise. You are looking for values of $\\lambda$ that make the matrix singular.

### A concrete pair
$$\\det\\begin{pmatrix} 2 & 1 \\\\ 0 & 3 \\end{pmatrix} - \\lambda I = (2-\\lambda)(3-\\lambda) = 0$$

So $\\lambda_1 = 2$ and $\\lambda_2 = 3$. For $\\lambda_1 = 2$ the eigenvector is $(1, 0)^{\\top}$ — stretch by 2, direction unchanged.

### Why this matters
Every matrix that repeats an operation — a rotation applied sixty times, a transformation run until it settles — is governed entirely by these values.`,
      createdAt: new Date(Date.now() - 864e5).toISOString(),
      status: "complete",
      studyContext: [SEED_MEMORIES[0], SEED_MEMORIES[3]],
      contextNote:
        "Shaped by your exam goal (matrix decompositions) and your preference for worked examples before abstraction.",
    },
  ],
  conv_plan: [
    {
      id: "m_p1",
      role: "user",
      content: "Give me a revision plan for the exam. Two weeks out.",
      createdAt: new Date(Date.now() - 864e5 * 6).toISOString(),
      status: "complete",
    },
    {
      id: "m_p2",
      role: "assistant",
      content: `Two weeks, weighted toward the parts you named as weakest.

### Week one — foundations
- Mon / Tue: vector spaces, bases, rank. Drill until rank is boring.
- Wed / Thu: matrix algebra and determinants.
- Fri: eigenvalues and eigenvectors, with at least five worked problems.
- Sat: consolidation pass. Sunday: rest.

### Week two — payoff
- Mon / Tue: diagonalisation and what it buys you.
- Wed / Thu: SVD, least squares, and the quadratic form.
- Fri: one full past paper under timed conditions.
- Sat: review every mistake log entry from the fortnight.

> Anything you get wrong here should be logged. That is what the next session will use.`,
      createdAt: new Date(Date.now() - 864e5 * 6).toISOString(),
      status: "complete",
      studyContext: [SEED_MEMORIES[0]],
      contextNote: "Built around your recorded goal: the linear-algebra exam in about two weeks.",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Memory retrieval — keyword scoring, so context feels earned         */
/* ------------------------------------------------------------------ */

const TOPIC_RULES: Array<{ match: RegExp; memory: StudyMemory; note: string }> = [
  {
    match: /eigen|matrix|matrices|singular|decompos|svd|linear algebra|determinant/i,
    memory: SEED_MEMORIES[0],
    note: "Anchored in your exam goal: eigenvalues and matrix decompositions.",
  },
  {
    match: /force|newton|ram p|incline|friction|momentum/i,
    memory: SEED_MEMORIES[2],
    note: "Used a recurring mistake you logged: treating a single force as the net force.",
  },
  {
    match: /photon|quantum|light|interference|spectr/i,
    memory: SEED_MEMORIES[1],
    note: "Built on the quantum topic you studied recently.",
  },
  {
    match: /plan|revision|schedule|exam|study|week/i,
    memory: SEED_MEMORIES[0],
    note: "Built around your recorded exam goal.",
  },
];

function retrieve(text: string): { items: StudyMemory[]; note?: string } {
  const hits = TOPIC_RULES.filter((r) => r.match.test(text));
  if (hits.length === 0) {
    return { items: [] };
  }
  const items = hits.map((h) => h.memory);
  // The stated answer-style preference applies to every answer.
  if (!items.some((i) => i.id === "mem_pref_style")) {
    items.push(SEED_MEMORIES[3]);
  }
  const notes = hits.map((h) => h.note);
  return { items, note: notes.join(" ") };
}

/* ------------------------------------------------------------------ */
/* Reply generation                                                    */
/* ------------------------------------------------------------------ */

function buildReply(
  req: SendMessageRequest,
  attachments: Attachment[],
): string {
  const q = req.content.trim();
  const has = attachments.length > 0;
  const topic = q.replace(/\s+/g, " ").slice(0, 90);

  const head =
    req.responseMode === "quiz"
      ? `Three questions on **${topic}**, hardest last. Say which you want marked.`
      : req.responseMode === "deep-dive"
        ? `Going deeper on **${topic}**.`
        : `Here is **${topic}**, step by step.`;

  const body =
    req.responseMode === "quiz"
      ? `1. State the definition in one sentence, without symbols.
2. Work a small numerical example and show every intermediate step.
3. Give one situation where the idea fails, and explain why.`
      : `### What is actually happening
The short version is that the rule you are asking about only holds when you account for **every** force acting at once, not just the one you noticed first.

1. Identify the forces in the situation, and draw them at the point they act.
2. Choose an axis. Along each axis, write down the sum.
3. Apply the law with the sum, then only then substitute numbers.

### A worked example
Take a $2\\,\\text{kg}$ block on a surface tilted at $30^{\\circ}$. Gravity is $mg = 19.6\\,\\text{N}$. Along the slope:

$$F_{\\text{net}} = mg\\sin 30^{\\circ} = 19.6 \\times 0.5 = 9.8\\,\\text{N}$$

$$a = \\frac{F_{\\text{net}}}{m} = \\frac{9.8}{2} = 4.9\\,\\text{m/s}^2$$

Notice the mass cancels out of the *direction* question entirely. Mass only scales how hard the net force has to be to change the motion.

### The part people miss
The step that goes wrong is treating "the force I can feel" as "the net force". They differ exactly when there is more than one significant force, which is most real situations.`

  const files = has
    ? `\n\n---\n\nI can see **${attachments.length}** attachment${attachments.length > 1 ? "s" : ""}: ${attachments.map((a) => `_${a.name}_`).join(", ")}. I have the file, but I will only treat a section as read once backend processing reports it as ready.`
    : "";

  return `${head}\n\n${body}${files}`;
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

class MockApi implements RecallApi {
  private conversations: Conversation[] = [...SEED_CONVERSATIONS];
  private messages: Record<string, ChatMessage[]> = structuredClone(SEED_MESSAGES);
  private memories: StudyMemory[] = [...SEED_MEMORIES];
  private attachments = new Map<string, Attachment>();
  private listeners = new Set<(c: Conversation[]) => void>();

  /** Lets the store refresh the sidebar without polling. */
  subscribe(fn: (c: Conversation[]) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    const sorted = [...this.conversations].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    this.listeners.forEach((fn) => fn(sorted));
  }

  async listConversations(signal?: AbortSignal) {
    await wait(320, signal);
    return [...this.conversations].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async createConversation() {
    const conv: Conversation = {
      id: uid("conv"),
      title: "New conversation",
      updatedAt: now(),
      preview: "",
      draft: true,
    };
    this.conversations = [conv, ...this.conversations];
    this.messages[conv.id] = [];
    this.emit();
    return conv;
  }

  async getConversation(id: string, signal?: AbortSignal) {
    await wait(200, signal);
    const c = this.conversations.find((x) => x.id === id);
    if (!c) throw new ApiError("Conversation not found", "not_found", 404);
    return c;
  }

  async getMessages(id: string, signal?: AbortSignal) {
    await wait(420, signal);
    return this.messages[id] ?? [];
  }

  async renameConversation(id: string, title: string) {
    const c = this.conversations.find((x) => x.id === id);
    if (!c) throw new ApiError("Conversation not found", "not_found", 404);
    c.title = title;
    c.updatedAt = now();
    c.draft = false;
    this.emit();
    return c;
  }

  async deleteConversation(id: string) {
    this.conversations = this.conversations.filter((c) => c.id !== id);
    delete this.messages[id];
    this.emit();
  }

  private resolveAttachments(ids: string[]) {
    return ids
      .map((id) => this.attachments.get(id))
      .filter((a): a is Attachment => !!a);
  }

  async sendMessage(conversationId: string, body: SendMessageRequest) {
    const atts = this.resolveAttachments(body.attachmentIds);
    const ctx = retrieve(body.content);
    const userMessage: ChatMessage = {
      id: uid("m"),
      role: "user",
      content: body.content,
      createdAt: now(),
      status: "complete",
      attachments: atts.length ? atts : undefined,
    };
    const assistantMessage: ChatMessage = {
      id: uid("m"),
      role: "assistant",
      content: "",
      createdAt: now(),
      status: "streaming",
    };
    this.messages[conversationId] = [
      ...(this.messages[conversationId] ?? []),
      userMessage,
      assistantMessage,
    ];

    // Title derives from the first real question.
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      const isFirst = this.messages[conversationId].length <= 2;
      if (isFirst && conv.title === "New conversation") {
        conv.title =
          body.content.trim().slice(0, 46) +
          (body.content.trim().length > 46 ? "…" : "");
        conv.draft = false;
      }
      conv.preview = body.content.trim().slice(0, 80);
      conv.updatedAt = now();
      this.emit();
    }

    assistantMessage.content = buildReply(body, atts);
    assistantMessage.studyContext = ctx.items.length ? ctx.items : undefined;
    assistantMessage.contextNote = ctx.note;
    assistantMessage.status = "complete";

    const res: SendMessageResponse = { conversationId, userMessage, assistantMessage };
    return res;
  }

  async streamMessage(
    conversationId: string,
    body: SendMessageRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ) {
    const atts = this.resolveAttachments(body.attachmentIds);
    const ctx = retrieve(body.content);
    const full = buildReply(body, atts);
    const messageId = uid("m");
    const createdAt = now();

    handlers.onStart?.(messageId, createdAt);

    const userMessage: ChatMessage = {
      id: uid("m"),
      role: "user",
      content: body.content,
      createdAt,
      status: "complete",
      attachments: atts.length ? atts : undefined,
    };
    this.messages[conversationId] = [...(this.messages[conversationId] ?? []), userMessage];

    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      if (conv.title === "New conversation") {
        const t = body.content.trim();
        conv.title = t.slice(0, 46) + (t.length > 46 ? "…" : "");
        conv.draft = false;
      }
      conv.preview = body.content.trim().slice(0, 80);
      conv.updatedAt = now();
      this.emit();
    }

    // Context arrives before the text, matching the documented event order.
    await wait(320, signal);
    if (ctx.items.length) handlers.onContext?.(ctx.items, ctx.note);

    // Token-ish chunks.
    const chunks = full.match(/\S+\s*/g) ?? [];
    for (const chunk of chunks) {
      if (signal?.aborted) return;
      handlers.onDelta?.(chunk);
      await wait(9 + Math.random() * 16);
    }
    handlers.onDone?.();
  }

  async uploadAttachment(file: File, onProgress: (pct: number) => void) {
    const lower = file.name.toLowerCase();
    const spec = ALLOWED_UPLOAD_TYPES.find((t) =>
      t.extensions.some((e) => lower.endsWith(e)),
    );
    if (!spec) {
      throw new ApiError(
        `${file.name}: ${file.type || "This file type"} is not supported yet. Allowed: PDF, TXT, MD, DOCX, PNG, JPG, WEBP.`,
        "unsupported_file",
      );
    }
    if (file.size > spec.maxBytes) {
      throw new ApiError(
        `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit for ${spec.label} is ${(spec.maxBytes / 1048576).toFixed(0)} MB.`,
        "too_large",
      );
    }

    const id = uid("att");
    const record: Attachment = {
      id,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind: spec.kind,
      status: "uploading",
      progress: 0,
      local: false,
    };
    this.attachments.set(id, record);

    for (let pct = 12; pct <= 100; pct += 11) {
      await wait(80);
      record.progress = Math.min(pct, 100);
      onProgress(record.progress);
    }

    // The frontend shows this state; it must not imply the file has been read.
    record.status = "processing";
    record.progress = undefined;
    await wait(700);
    record.status = "ready";
    return { ...record };
  }

  async removeAttachment(id: string) {
    this.attachments.delete(id);
  }

  async getStudyContext(conversationId: string, signal?: AbortSignal): Promise<StudyContext> {
    await wait(260, signal);
    const msgs = this.messages[conversationId] ?? [];
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i];
      if (m.role === "assistant" && m.studyContext?.length) {
        return {
          items: m.studyContext,
          note: m.contextNote,
          sourceMessageId: m.id,
          loading: false,
        };
      }
    }
    return { items: [], loading: false };
  }

  async removeMemory(id: string) {
    this.memories = this.memories.filter((m) => m.id !== id);
  }

  async submitFeedback(messageId: string, feedback: MessageFeedback) {
    void messageId;
    void feedback;
    await wait(180);
  }
}

export function createMockApi(): RecallApi {
  return new MockApi();
}

export const MAX_ATTACHMENTS = MAX_ATTACHMENTS_PER_MESSAGE;