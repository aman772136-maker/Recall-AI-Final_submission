# RecallAI

A chat-first study companion with graph-backed persistent memory.

The visual language is carried over unchanged from the Fastshot hero: dark
stage, glass panels, warm accent, Inter variable. Components read design tokens
only, so light mode is a token swap rather than a rewrite.

---

## Run it

Two terminals.

```bash
npm install

npm run dev:api     # http://localhost:4000  (no database needed)
npm run dev         # http://localhost:3000
```

The web app decides which backend it talks to at build time:

```
NEXT_PUBLIC_API_URL unset   → in-memory mock, seeded fixtures
NEXT_PUBLIC_API_URL set     → the Express API
```

### Point it at the real API

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev
```

### Point the API at a database

Without `DATABASE_URL` the API uses an in-memory store: every route behaves
identically, but history is lost on restart.

```bash
cp apps/api/.env.example apps/api/.env
# set DATABASE_URL to a Neon or local Postgres connection string
npm run migrate -w @recallai/api
npm run dev:api
```

The API is usable before you provision anything — that is deliberate.

### Checks

```bash
npm run typecheck    # web + api
npm run lint
npm run build
```

---

## Structure

```
recallai/
├── apps/
│   ├── api/                      Express · TypeScript · Postgres
│   │   └── src/
│   │       ├── config.ts         .env loader, safe defaults
│   │       ├── server.ts         app wiring, CORS, /health
│   │       ├── db/
│   │       │   ├── schema.sql    tables, indexes, trigger
│   │       │   ├── repository.ts the interface both stores implement
│   │       │   ├── pg-repository.ts
│   │       │   ├── memory-repository.ts
│   │       │   └── migrate.ts
│   │       ├── services/
│   │       │   ├── answer.ts     AnswerProvider — the LLM swap point
│   │       │   ├── memory.ts     retrieval + recording
│   │       │   └── files.ts      storage and text extraction
│   │       └── routes/
│   │           ├── conversations.ts · messages.ts · uploads.ts
│   │           ├── context.ts     context + memories + feedback
│   │           └── helpers.ts     async wrapper, error translation
│   └── web/                      Next.js 15 · React 19 · TypeScript
│       ├── app/
│       │   ├── layout.tsx        fonts, metadata, theme attribute
│       │   ├── globals.css       design tokens (dark default + light mode)
│       │   ├── app.css           component styles
│       │   └── page.tsx          AppProvider > AppShell
│       └── src/
│           ├── lib/
│           │   ├── api/          types · mock · http · transport switch
│           │   ├── markdown.tsx  safe renderer + KaTeX
│           │   ├── files.ts      allowlist validation, previews
│           │   └── time.ts       history grouping
│           ├── store/
│           │   └── AppStore.tsx  one reducer, all UI state
│           └── components/
│               ├── layout/       AppShell · Sidebar · dialogs
│               ├── chat/         header · welcome · messages · composer
│               ├── uploads/      AttachmentPreview · ImagePreview
│               └── study-context/ StudyContextPanel
└── packages/
    └── shared-types/             the contract both sides import
```

---

## The transport switch

One file decides everything: `apps/web/src/lib/api/index.ts`.

```
NEXT_PUBLIC_API_URL=""     → createMockApi()
NEXT_PUBLIC_API_URL="…"    → new HttpApi(url)
```

No component imports a transport. Nothing in the UI knows which is live.

---

## API contract

| Method | Route | Notes |
|---|---|---|
| `GET` | `/health` | reports store and answer provider |
| `GET` | `/api/conversations` | `Conversation[]`, newest first |
| `POST` | `/api/conversations` | 201, `Conversation` |
| `GET` | `/api/conversations/:id` | `{ ...Conversation, messages }` |
| `PATCH` | `/api/conversations/:id` | `{ title }` |
| `DELETE` | `/api/conversations/:id` | 204 |
| `POST` | `/api/conversations/:id/messages` | JSON response |
| `POST` | `/api/conversations/:id/messages/stream` | SSE |
| `GET` | `/api/conversations/:id/context` | `StudyContext` |
| `GET` | `/api/conversations/:id/memories` | every memory for the conversation |
| `GET` | `/api/memories` | every memory |
| `DELETE` | `/api/memories/:id` | forget one |
| `POST` | `/api/uploads` | multipart, returns `Attachment` |
| `DELETE` | `/api/uploads/:id` | 204, removes the file |
| `POST` | `/api/messages/:id/feedback` | `{ feedback }` |

### Send payload

```json
{
  "content": "Why does F = ma need 'net'?",
  "attachmentIds": ["upload-id-1"],
  "responseMode": "study"
}
```

### Stream events

SSE frames are `data: <json>` separated by a blank line. The UI handles
exactly these and reports anything else as a protocol error rather than
guessing:

```
message_start  { messageId, createdAt }
context        { messageId, items, note }
delta          { messageId, text }
done           { messageId }
error          { messageId, message }
```

`context` is emitted before the first `delta`, so the study-context panel can
populate before the answer finishes typing.

---

## Math

LaTeX in an answer is typeset by **KaTeX**, not approximated with italics.

```markdown
Inline:   the identity $\sum \mathbf{F} = m\mathbf{a}$
Display:  $$Av = \lambda v$$
Matrices: $$\det\begin{pmatrix} 2 & 1 \\ 0 & 3 \end{pmatrix} = 0$$
```

`markdown.tsx` reaches `dangerouslySetInnerHTML` in exactly one place, the
`<Tex>` component, and only for KaTeX output. KaTeX runs with `trust: false`,
which disables `\href`, `\url` and `\includegraphics` — the commands that could
otherwise emit attacker-chosen URLs or markup. All other output is escaped by
KaTeX itself. A malformed formula falls back to its source rather than
breaking the answer.

---

## What is real and what is simulated

**Real**
- Every layout and responsive breakpoint
- Composer: autogrow, Enter to send, Shift+Enter newline, paste files
- Attachment validation, upload progress, per-file retry and remove
- SSE streaming with stop, interrupted state, and retry
- Markdown + LaTeX rendering, streamed chunk by chunk
- Optimistic rename/delete with rollback on failure
- Memory recording from the user's own words, and retrieval on later turns
- Toasts, offline banner, loading, empty and error states, focus-visible rings

**Simulated**
- Assistant reasoning. `LocalAnswerProvider` is a deterministic template, not
  a model. It exists so the streaming path is real and testable.
- Memory retrieval is keyword overlap over a GIN-indexed `text[]`. The graph
  service described in the spec drops in behind `services/memory.ts`.
- Text extraction works for `.txt` and `.md`. PDF, DOCX and images report
  honestly that no extractor is wired up rather than pretending.
- Authentication. The UI says "Local session", never "signed in".

---

## Deliberate decisions

- **No memories are invented in the browser.** The context panel renders only
  what the backend returns. With no memory it says so plainly and chat keeps
  working.
- **Attachments never imply a file has been read.** `ready` means extraction
  finished. For formats with no extractor, the API records exactly why.
- **No credentials in the browser.** No LLM key, no database URL. The
  `AnswerProvider` interface is the only place a model is called, and it runs
  server-side.
- **Validation is duplicated on purpose.** The browser validates for fast
  feedback; the API validates again because the browser is not a security
  boundary. Uploaded files are treated as untrusted and are never executed or
  interpreted as anything but bytes.
- **The background video is not panned or zoomed.** `object-fit: cover` only.
  A dawn gradient sits underneath so the palette survives if the video is
  blocked, still decoding, or removed by `prefers-reduced-motion`.

---

## Next

1. Provision a Neon project for RecallAI and set `DATABASE_URL`.
2. Replace `LocalAnswerProvider` with a model-backed one.
3. Add PDF/DOCX extraction and OCR behind the existing `processing` state.
4. Replace keyword retrieval with the FalkorDB graph queries.
5. Authentication — until then nothing in the UI implies a signed-in user.