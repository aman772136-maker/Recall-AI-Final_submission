# RecallAI — Project Context

Everything needed to pick this project up cold. Written after the first full
build + verification pass.

---

## 1. What this is

A **chat-first study companion with graph-backed persistent memory**. The user
asks questions, attaches notes or photos, and gets explanations, worked
examples, quizzes and revision plans. The defining feature is not a decorative
graph — it is that **useful learning context recorded in one session influences
a later answer**, and the interface explains that connection in plain language.

Built to a written spec:
`C:\Users\91787\Desktop\RecallAI_Frontend_Product_and_Functional_Specification.md`

---

## 2. Current state

| Area | Status |
|---|---|
| Web app (Next.js) | Complete, running on `:3000` (Modern glassmorphic composer, micro-animations, responsive) |
| API (Express) | Complete, running on `:4000` |
| Database | **In-memory.** `DATABASE_URL` unset — history resets on API restart |
| Assistant reasoning | **Ollama Local LLM** (`qwen2.5:1.5b` via `OllamaAnswerProvider`) with NDJSON streaming & auto-fallback |
| Memory retrieval | **FalkorDB Graph Engine** (`falkordb` client, multi-hop Cypher traversal, edge reasoning) connected to cloud instance |
| Attachments | `.txt` / `.md` extract. PDF, DOCX, images store but yield no text |
| Auth | None. UI says "Local session", never "signed in" |
| Neon | Not provisioned. Two unrelated projects exist on the account |

Gates: `npm run verify` (typecheck both workspaces), `npm run lint`,
`npm run build` — all passing.

---

## 3. Origin

Started as a single self-contained HTML file (`fastshot.html`, still in the repo
root) — a Fastshot landing hero with a background video and a composer card.
The design language was carried over **unchanged**: dark stage, glass panels
(`rgba(41,41,43,.955)` + `blur(26px)`), `--r-card: 26px`, 30u pill chips, a 35u
orange send circle that deliberately overshoots the chip row, warm accent
gradient `#FBBC94 → #E88654`, focus ring `#F8B285`.

**Rule for all future UI work: change tokens, not the visual language.**

---

## 4. Stack and layout

```
recallai/
├── apps/
│   ├── api/         Express 4 · TypeScript · pg · multer 2 · zod
│   └── web/         Next.js 15 (App Router) · React 19 · TypeScript
│                    KaTeX · lucide-react
├── packages/
│   └── shared-types/  the contract both sides import
└── scripts/verify.mjs
```

npm workspaces. Two processes:

```bash
npm install
npm run dev:api     # :4000
npm run dev         # :3000
```

`apps/web/.env.local` currently sets `NEXT_PUBLIC_API_URL=http://localhost:4000`,
so the web app talks to the real API, not the mock.

> Note: this machine's npm `script-shell` is `powershell.exe`, and PS 5.1 cannot
> parse `&&`. That is why root scripts go through `scripts/verify.mjs` instead
> of chaining with `&&`.

---

## 5. Typography (most recent change)

| Role | Face | Loaded as |
|---|---|---|
| Display titles | **Instrument Serif** | `--font-display` |
| Body, UI, paragraphs | **Bricolage Grotesque** | `--font-text` |

Applied to: welcome headline, conversation header title, dialog headings, study
context panel heading, and all markdown `h1/h2/h3` inside answers.

Not applied to: body copy, buttons, chips, labels, sidebar — those stay
Bricolage Grotesque.

**Trap hit here:** the original Fastshot hero used `font-display: block` to
avoid reflow. Ported into an app, that made the **entire UI render blank** when
the font was slow. Switched to `display=swap` — a chat app must never show an
empty screen because a webfont is in flight.

---

## 6. Architecture decisions worth remembering

**One transport switch.** `apps/web/src/lib/api/index.ts` is the only file that
knows whether the backend is real or mocked:

```
NEXT_PUBLIC_API_URL unset  → createMockApi()   (seeded fixtures)
NEXT_PUBLIC_API_URL set    → new HttpApi(url)
```

No component imports a transport.

**One repository interface.** `apps/api/src/db/repository.ts`, implemented by
`PgRepository` (Postgres/Neon) and `MemoryRepository`. Same behaviour, so the
stack runs before any DB is provisioned.

**One answer seam.** `AnswerProvider` in `services/answer.ts`. Implemented by
`OllamaAnswerProvider` in `services/ollama.ts` (targeting `qwen2.5:1.5b` over local Ollama HTTP NDJSON stream) with automatic graceful fallback to `LocalAnswerProvider` when the Ollama daemon is offline.
The provider automatically injects:
1. Pedagogical tutor system persona with mode instructions (`study`, `deep-dive`, `quiz`).
2. FalkorDB graph-retrieved concepts and durable student memories (mistakes, goals, topics).
3. Extracted text from uploaded student attachments.
4. Multi-turn conversation history for continuity.
5. Strict KaTeX formatting instructions (`$ ... $` and `$$ ... $$`).

**Tokens, not raw colors.** Light mode is a `[data-theme="light"]` token swap in
`globals.css`. When adding UI, add a token rather than a hex.

---

## 7. API contract

| Method | Route |
|---|---|
| `GET` | `/health` |
| `GET`/`POST` | `/api/conversations` |
| `GET`/`PATCH`/`DELETE` | `/api/conversations/:id` |
| `POST` | `/api/conversations/:id/messages` (JSON) |
| `POST` | `/api/conversations/:id/messages/stream` (SSE) |
| `GET` | `/api/conversations/:id/context` |
| `GET` | `/api/conversations/:id/memories` |
| `GET` | `/api/memories` |
| `DELETE` | `/api/memories/:id` |
| `POST`/`DELETE` | `/api/uploads`, `/api/uploads/:id` |
| `POST` | `/api/messages/:id/feedback` |

SSE frames are `data: <json>` + blank line:

```
message_start { messageId, createdAt }
context       { messageId, items, note }   ← before the first delta
delta         { messageId, text }
done          { messageId }
error         { messageId, message }
```

---

## 8. Product rules that must not be broken

These come from the spec and were deliberate choices, not accidents:

1. **Never invent memory.** The context panel renders only what the backend
   returns. With no memory it says so plainly and chat keeps working.
2. **Never imply a file was read.** `ready` means extraction finished. For
   formats with no extractor, the API records exactly why.
3. **No credentials in the browser.** No LLM key, no database URL.
4. **Validate twice on purpose.** The browser validates for fast feedback; the
   API validates again because the browser is not a security boundary.
5. **Demo data is labelled.** Seeded fixtures carry `source: "demo"` and are
   badged in the UI so they are never mistaken for a real user's history.
6. **No fake auth.** "Local session", not "signed in".
7. **Markdown is sanitised.** Output is parsed into React elements.
   `dangerouslySetInnerHTML` appears in exactly one place — the `<Tex>` KaTeX
   component — with `trust: false`, which disables `\href`, `\url` and
   `\includegraphics`.

---

## 9. Bugs found and fixed

Kept because they are all non-obvious and likely to recur:

| Bug | Cause | Fix |
|---|---|---|
| Streaming emitted **zero deltas** | Aborted on `req.on("close")`, which fires as soon as the body is read — before generation started | `res.on("close")` |
| `DELETE /api/memories/:id` → 404 | Router mounted under `/api/conversations` | Dedicated `memoriesRouter` at `/api/memories` |
| Oversize upload → 500 | Multer `LIMIT_FILE_SIZE` unmapped | Map to 413 in `errorHandler` |
| `conversationId` leaked to browser | `listMessages` spread the stored row | Destructure it out |
| Web app got nothing | CORS allowed only `localhost:3000` | Reflect localhost in dev, **require** an explicit list in prod |
| "New conversation" button enormous | `flex: 1` inside a **column** flex container grew height | `flex: none; width: 100%` |
| Starter titles ran together | `<span>` children with no `display: block` | Explicit display |
| Icon stacked above button label | Global `svg { display: block }` | `.btn { display: inline-flex }` |
| Mobile sidebar covered everything | Drawer was `position: fixed` and always visible | `translateX(-100%)` until opened |
| Code fences destroyed | Block splitter split on blank lines inside a fence | Track fence state while splitting |
| Whole UI blank | `font-display: block` | `display: swap` |
| `npm run build` failed | npm `script-shell` is PowerShell; no `&&` | `scripts/verify.mjs` |
| Send button SVG inverted | Old hardcoded path drew a downward-left arrow | Replaced with `<ArrowUp size={16} strokeWidth={2.6} />` from Lucide |
| FalkorDB idle socket `ECONNRESET` | Redis client emitted uncaught `error` on idle disconnect, crashing Node | Attached `this.client.on("error", ...)` handler |
| Composer chips wrapped awkwardly on mobile | Flex wrapping squished chips against send button | Transformed into horizontal swipe strip with fade mask and separated thumb action bar |
| `StudyMemory` compile error | `ollama.ts` referenced non-existent `detail`/`confidence` | Corrected to `summary` per `@recallai/shared-types` |

**Measurement lesson:** Chrome clamps `--window-size` below its minimum, so
early "mobile is broken" screenshots were a lie — the page was laid out wider
than the image. Real verification drives the DevTools protocol directly
(`Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot`).

---

## 10. Verification

- **66/66** API contract checks — CRUD, SSE framing and event order,
  persistence, validation, upload rejection by type and size, error shapes,
  memory round trip, cleanup.
- **15/15** full-stack browser checks — history from the API, KaTeX, progressive
  streaming (text grows between samples, cursor appears then clears), context
  panel, history surviving a reload.
- **0** overflowing elements measured at 1440 / 820 / 390 and in light mode.

---

## 11. Next work, in priority order

1. ~~**Real model behind `AnswerProvider`**~~ — **Complete.** Implemented via `apps/api/src/services/ollama.ts` (`OllamaAnswerProvider`) targeting `qwen2.5:1.5b` with live NDJSON streaming, prompt infusion (FalkorDB graph context, student memories, extracted attachments, multi-turn history), and seamless auto-fallback to `LocalAnswerProvider`.
2. **Provision Neon + run `npm run migrate`** — the in-memory store loses
   history on every restart. Needs a new project; the two on the account
   (`SSHDock`, `mute-tree-35692987`) are unrelated.
3. **Multer → `diskStorage`** — `memoryStorage` buffers the whole file in RAM
   twice.
4. **Sidebar previews** — the API never sets `Conversation.preview`, so history
   shows "Updated 2h" instead of a preview. Derive from the last user message.
5. **PDF/DOCX/OCR extraction** — the states already exist; filling them makes
   attachments actually useful.
6. ~~**FalkorDB behind `services/memory.ts`**~~ — **Complete.** Implemented via `apps/api/src/services/falkordb.ts` with OpenCypher multi-hop traversals, concept ontology, plain language edge explanations, and automatic fallback.
7. **Auth**, with a `user_id` column added to `memories` before it lands.

---

## 12. Guide: Attaching Qwen 2.5 1.5B via Ollama Locally

RecallAI is fully configured to stream responses from **Qwen 2.5 1.5B** running locally on your device. Follow these steps whenever you are ready to activate local inference:

### Step 1: Install Ollama
Download and install Ollama from [ollama.com](https://ollama.com) (available for Windows, macOS, and Linux).

### Step 2: Pull and Start Qwen 2.5 1.5B
Open a terminal (PowerShell or Command Prompt) and run:
```bash
ollama run qwen2.5:1.5b
```
This downloads the ~986 MB model weights and starts the local model server.

### Step 3: Verify the Ollama Daemon
Check that Ollama is responding locally at port `11434`:
```powershell
Invoke-RestMethod -Uri http://localhost:11434/api/tags
```
You should see `qwen2.5:1.5b` listed in the returned models array.

### Step 4: Verify RecallAI Connectivity
Query the RecallAI API health endpoint:
```powershell
Invoke-RestMethod -Uri http://localhost:4000/health
```
When Ollama is running, it will output:
```json
{
  "ok": true,
  "answerProvider": "ollama",
  "ollama": {
    "configuredModel": "qwen2.5:1.5b",
    "baseUrl": "http://localhost:11434",
    "online": true,
    "hasModel": true,
    "status": "ready"
  },
  "contextStore": "falkordb",
  "falkorGraph": "recallai_study_graph"
}
```

### Step 5: Configuration Options
Settings can be customized in `apps/api/.env`:
```env
# Ollama Local LLM
OLLAMA_ENABLED=true               # Set to false to force mock provider
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b         # Can be switched to qwen2.5:3b, qwen2.5:7b, etc.
OLLAMA_TEMPERATURE=0.7            # Model generation temperature (0.0 to 1.0)
OLLAMA_TIMEOUT_MS=120000          # Timeout for generation stream
```

### Automatic Fallback Behavior:
- **When Ollama is stopped**: RecallAI automatically falls back to the deterministic local study provider without crashing or throwing client errors.
- **When Ollama is started**: The very next message sent in the chat automatically routes through Qwen 2.5 1.5B with live SSE token streaming. No server restart is needed.

---

## 13. Environment notes

- Dev servers are typically running: `:3000` (web), `:4000` (api).
- **A black "N" circle appears over the bottom-left avatar in screenshots.**
  That is a browser extension overlay in this environment, not part of the app.
  Do not "fix" it.
- **A green robot circle appears on the top-right of the textarea.**
  That is also an injected browser extension overlay (e.g. Monica / AI writing tool).
  Do not treat it as a UI glitch in the composer.
- Screenshots were taken at 390px width and appeared to show the composer model
  label clipped. Measured geometry proves it renders fully (25→97px); the
  overlay was covering it.