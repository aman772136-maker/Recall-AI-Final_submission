# **RecallAI** 

### **Frontend Product & Functional Specification** 

_React web application • Chat-first study companion • Graph-backed persistent memory_ 

Purpose: give the frontend builder a clear, implementation-ready description of the screens, components, behaviors, API expectations, and build order for RecallAI. 

## **1. Product summary** 

RecallAI is a persistent AI study companion. It should feel familiar to users of modern AI chat apps, while making it clear that it remembers useful learning context across sessions. The user can ask questions, upload study material, work through explanations, and later receive recommendations informed by previously recorded goals, topics, mistakes, and progress. 

The core product loop is: user interaction → extract useful learning signals → retrieve relevant memory → answer or recommend → record new learning signals. The frontend displays the conversation and, when useful, a concise explanation of what memory influenced a recommendation. The graph database and model calls must remain behind the backend; the browser must never connect directly to FalkorDB or contain database credentials. 

Reference-file note: the supplied ZIP is titled “OpsGraph AI — Advanced Hackathon Build Pack” and describes a DevOps investigation product, not RecallAI. This specification does not copy its DevOps features. It adapts the useful high-level ideas of a chat-first interface, streaming responses, graph-backed context, explainability, and progressive implementation to RecallAI’s study-companion purpose. 

## **2. Product goals and non-goals** 

#### **Goals** 

- A clean chat-first interface with a left sidebar and conversation history, familiar to ChatGPT users. 

- A persistent chat composer with text entry, file upload, and photo/image upload controls. 

- Conversation management: create, rename, search, open, and delete conversations. 

- Study-focused responses: explanations, worked examples, quiz questions, summaries, and study plans. 

- A visible but unobtrusive way to inspect relevant learning memory, goals, recent topics, and recommendations. 

- Graceful loading, streaming, retry, empty, offline, and error states. 

- A responsive layout that works on laptop and mobile screens. 

- A frontend architecture that can connect to a Node.js + Express API and FalkorDB-backed memory service later. 

#### **Non-goals for the first version** 

- Do not build a full graph editor or graph visualization as a blocker for the chat MVP. 

- Do not call an LLM provider directly from the browser or expose API keys. 

- Do not assume uploads are already parsed or understood; show processing status and backend errors. 

- Do not present inferred memory or AI-generated study progress as confirmed facts without indicating uncertainty. 

- Do not build multi-agent orchestration, complex analytics, or collaborative classrooms before the core chat loop works. 

RecallAI • Frontend Product & Functional Specification 

## **3. Primary user journey** 

1. User opens RecallAI and sees a welcome state with a short explanation and suggested prompts. 

2. User starts a new conversation or opens an existing one from the sidebar. 

3. User types a question, attaches a PDF/document or photo, and sends the message. 

4. The frontend displays the user message immediately and shows a pending/streaming assistant response. 

5. The backend retrieves relevant graph memory and available file context, then returns a response and optional memory references. 

6. The assistant answer appears with readable formatting and optional actions such as Copy, Regenerate, Explain more, Make a quiz, or Save as a study note. 

7. The sidebar updates with the conversation title and timestamp. 

8. A Memory/Study Context panel may show the relevant topic, known goal, or previous misconception used in the response. 

9. New useful signals can be recorded by the backend and become available in later conversations. 

## **4. Layout and visual direction** 

#### **Desktop layout** 

|**Area**|**Expected behavior**|
|---|---|
|**Left sidebar (about 250–290 px)**|RecallAI brand; New chat button; search conversations;<br>grouped history (Today, Previous 7 days, Older);<br>user/settings area at bottom; collapse control.|
|**Main conversation area**|Scrollable messages; welcome screen when empty;<br>conversation title/header; assistant and user messages;<br>loading/streaming indicators.<br>i|
|**Composer at bottom**|Multiline text input, attach-file button, add-photo button,<br>send button; keyboard hints; attachment chips/previews;<br>safe disabled states.|
|**Optional right context panel**|Collapsed by default or opened from a button; shows<br>relevant memory, learning goals, recent topics, and why a<br>recommendation was made.|
|**Responsive behavior**|Sidebar becomes a drawer on narrow screens; context<br>panel becomes a sheet/drawer; composer stays usable<br>without coveringmessages.|



#### **Visual style** 

- Use a calm, focused study-tool aesthetic: neutral background, readable typography, restrained blue accent, subtle borders, and consistent spacing. 

- Prioritize legibility over decoration. Avoid excessive gradients, animated backgrounds, and oversized cards. 

- Keep message content in a comfortable reading width; long answers should not stretch edge-to-edge on large monitors. 

- Use consistent icon buttons with accessible labels and tooltips. Do not rely on icons alone for important actions. 

- Support light mode first; structure colors as design tokens so dark mode can be added without rewriting components. 

- Use clear focus rings and sufficient contrast; all controls must work with keyboard navigation. 

## **5. Screen and component requirements** 

#### **5.1 Application shell** 

- AppShell: owns sidebar, main conversation viewport, optional context panel, and mobile drawers. 

- Sidebar: supports collapsed/expanded state; preserve current conversation selection when navigating. 

RecallAI • Frontend Product & Functional Specification 

- Header: displays conversation title, optional status, and a button to open Study Context. 

- Main content: keeps the latest message visible during streaming unless the user has intentionally scrolled upward. 

- Toast/notification layer: shows non-blocking success and error feedback. 

#### **5.2 Sidebar and chat history** 

- New chat button creates a local draft conversation immediately and focuses the composer. 

- Conversation list displays title, optional short preview, and last-updated ordering. 

- Group conversations by date ranges such as Today, Previous 7 days, and Older; date grouping can be simplified in MVP. 

- Search filters history by title and message text if the backend supports it; otherwise start with title-only search and label that limitation. 

- Conversation menu: Rename, Delete. Confirm destructive deletion before sending the request. 

- Selecting a conversation loads its messages and scrolls to the latest message. 

- Empty history state explains how to start a first conversation. 

- Use optimistic UI carefully: if rename/delete fails, restore the prior state and show an error. 

#### **5.3 Chat messages** 

- User messages support plain text and attachment chips/previews. 

- Assistant messages support paragraphs, headings, numbered steps, bullet lists, code blocks, tables, and mathematical notation where the chosen renderer supports it. 

- Assistant messages can show a streaming cursor/status while the backend is generating. 

- Per-answer actions: Copy, Regenerate, Give feedback (helpful/not helpful). Optional study actions: Explain more, Give an example, Quiz me, Summarize. 

- Do not show every action as a large button. Keep secondary actions in a compact toolbar. 

- For a failed response, show a retry action and preserve the user’s prompt. 

- If a response contains memory references, show a compact “Used study context” disclosure instead of interrupting the answer. 

#### **5.4 Chat composer** 

- Multiline textarea that grows to a sensible maximum height, then scrolls internally. 

- Send button enabled only when there is non-empty text or at least one valid attachment. 

- Enter sends; Shift+Enter inserts a newline. If this behavior is changed, display the keyboard hint clearly. 

- Attach-file icon opens a file picker for supported documents. 

- Photo/image icon opens an image picker and supports image preview before sending. 

- Show attachments as removable chips/cards before send; images should have thumbnails and a remove control. 

- Display upload/processing status, file size when available, and clear validation errors. 

- Disable duplicate sends while a request is being submitted; allow Stop generating if streaming cancellation is supported. 

- On failure, retain draft text and attachments where possible so the user does not lose work. 

- Add accessible labels such as “Attach a document”, “Add an image”, and “Send message”. 

#### **5.5 File and photo upload** 

|**Behavior**|**Requirement**<br>i      i|
|---|---|
|**Supported formats**|Define an allowlist in one shared config. Suggested MVP:<br>PDF, TXT, DOCX, PNG, JPG/JPEG, WEBP. Only include<br>formats the backend can actually process.<br>i|
|**Multiple attachments**|Allow multiple files if backend upload limits support it;<br>show each attachment independently.|
|**Validation**|Validate extension/type and size in the UI for fast<br>feedback, but always validate again on the backend.|
|**Progress**|Show queued/uploading/processing/ready/failed states.<br>Do not implya file has been read until backend|



RecallAI • Frontend Product & Functional Specification 

||processing confirms it.|
|---|---|
|**Image preview**|Show a small thumbnail; clicking can open a larger<br>preview. Remove action must be visible.|
|**Document preview**|Show filename, file type, and size; do not attempt to<br>render the entire document inside the composer.|
|**Security**|Treat file contents as untrusted input. Do not execute<br>macros, scripts, or embedded content.|
|**Failure handling**|Explain unsupported format, oversize file, network failure,<br>or parsing failure separately and provide retry/remove<br>actions.|



Important implementation boundary: the frontend can choose and upload files, but OCR, PDF/document extraction, chunking, and linking extracted text to a conversation are backend responsibilities. The frontend must render the server’s processing status rather than pretending parsing has completed. 

#### **5.6 Welcome / empty state** 

- Show RecallAI name and one-sentence value proposition: a study companion that can use learning context over time. 

- Provide 3–4 clickable prompt starters, for example: “Explain a concept step by step”, “Quiz me on a topic”, “Help me understand a mistake”, and “Make a revision plan”. 

- Clicking a prompt fills or sends the prompt consistently; do not surprise users by sending without clear indication. 

- If the user has existing learning goals, optionally show one small “Continue studying” suggestion only when that data is available. 

#### **5.7 Study Context / memory panel** 

- Open from a clearly named “Study context” or “Memory” control; hidden by default on small screens. 

- Show relevant remembered goals, recently studied topics, recurring mistakes, and the context used for the current answer when returned by the backend. 

- Each memory item should have a type label, short readable text, and optional last-updated date/source. 

- Provide a way to mark a memory as incorrect or remove it, if the backend supports editing/deletion. 

- Distinguish “Remembered from your study activity” from “Suggested by AI” where relevant. 

- If there is no context, say so plainly; do not manufacture example memories in a real user session. 

- Avoid exposing raw graph node IDs, Cypher, database internals, or hidden chain-of-thought. Explain the practical reason for a recommendation, not private reasoning. 

#### **5.8 Settings and profile** 

- Basic settings: theme preference, response style/verbosity, and whether study-context indicators are shown. 

- Profile/account controls can be placeholders until authentication is implemented, but must not pretend sign-in or sync is working. 

- A “Manage memories” page can be a later milestone; MVP can expose view/remove controls in the context panel if the API supports them. 

## **6. Required frontend functions** 

|**Function**|**Description**|**Priority**|
|---|---|---|
|**createConversation()**|Create a conversation and select it;<br>support an unsaved local draft if API<br>is unavailable.|P0|
|**listConversations()**|Load history, sort by updated time,<br>and display loading/empty/error<br>states.|P0|
|**getConversation(id)**|Load messages for a selected<br>conversation.|P0|
|**sendMessage()**|Submit text and attachment IDs,|P0|



RecallAI • Frontend Product & Functional Specification 

||render the user message, and start<br>response handling.||
|---|---|---|
|**streamAssistantResponse()**|Consume streaming response events<br>if supported; otherwise handle a<br>normal JSON response.|P0|
|**stopGeneration()**|Cancel a running generation only if<br>backend cancellation is<br>implemented.|P1|
|**uploadAttachment()**|Upload document/image, validate,<br>and return an attachment record/ID.|P0|
|**removeAttachment()**|Remove an attachment from the<br>unsent draft; optionally delete an<br>uploaded temporary asset if<br>supported.|P0|
|**renameConversation()**|Rename title and update sidebar<br>without losing selection.<br>i|P1|
|**deleteConversation()**|Confirm, delete, and choose a<br>sensible next screen.|P1|
|**searchConversations()**|Filter history; server-side search is<br>preferred when history grows.|P1|
|**copyMessage()**|Copy answer text and show<br>confirmation.|P1|
|**regenerateResponse()**|Request another response for the last<br>user prompt if supported.|P1|
|**submitFeedback()**|Record helpful/not helpful feedback if<br>endpoint exists.|P2|
|**getStudyContext()**|Fetch relevant memory items for<br>current conversation/answer.|P1|
|**removeOrCorrectMemory()**|Request correction/removal of a<br>memory if supported by the backend.|P2|
|**retryRequest()**|Retry failed uploads or assistant<br>requests without losingdraft state.|P0|





<!-- Start of picture text -->
P0<br><!-- End of picture text -->

## **7. Frontend state model** 

Keep UI state explicit rather than scattering unrelated booleans across components. A practical initial state shape: 

|**State**|**Example fields**|
|---|---|
|**App**|sidebarOpen, contextPanelOpen, theme, globalError|
|**Conversation list**|items, loading, error, searchQuery,<br>selectedConversationId|
|**Active conversation**|id, title, messages, loadingMessages, lastUpdatedAt|
|**Composer**|draftText, attachments[], isSubmitting|
|**Generation**|status: idle | submitting | streaming | complete | error,<br>activeRequestId|
|**Upload**|attachmentId, name, type, size, status, progress, error|
|**Study context**|items[],loading,error,sourceMessageId|



Use a shared data-fetching layer (for example, a small API client plus React Query/SWR if desired) and keep components mostly presentational. Do not duplicate the same conversation data independently in the sidebar and main panel. 

## **8. Suggested component tree** 

App 

- └── AppShell 

- ├── │├── 

   - Sidebar 

      - BrandHeader 

RecallAI • Frontend Product & Functional Specification 

- │├── NewChatButton 

- │├── ConversationSearch 

- │├── ConversationGroup 

- ││└── 

   - ConversationListItem 

- │└── UserSettingsMenu 

- ├── MainPanel 

- │├── ConversationHeader 

- │├── WelcomeScreen (when no messages) 

- │├── MessageList 

- ││├── 

   - UserMessage 

- ││├── AssistantMessage ││├── AttachmentPreview ││└── MessageActions │└── ChatComposer │ ├── AttachmentButton │ ├── ImageButton │ ├── AttachmentTray │ ├── MessageTextarea │ └── SendButton 

   - AttachmentPreview 

- └── StudyContextPanel / StudyContextDrawer 

## **9. Suggested technology choices** 

- React with TypeScript for component safety and predictable API types. 

- Vite for a straightforward frontend development setup, unless the team has already committed to Next.js. 

- React Router if multiple routes are needed; a single route with conversation IDs is acceptable for MVP. 

- A styling system such as Tailwind CSS or CSS modules; choose one and stay consistent. 

- Lucide icons or another consistent icon set for sidebar, upload, image, send, menu, and status icons. 

- A Markdown renderer with safe code-block support for assistant answers; sanitize rendered HTML and do not allow arbitrary raw HTML from model output. 

- Use the backend as the only connection to FalkorDB and LLM providers. 

The supplied OpsGraph pack recommends Next.js for its own product. RecallAI can use React + Vite for a simpler standalone frontend, or Next.js if server rendering/routing is a deliberate requirement. This is an implementation choice, not a requirement from the supplied ZIP. 

## **10. Node.js + Express backend contract** 

These endpoints are a proposed contract for frontend/backend coordination, not claims that they already exist. Implement the frontend with a central API client so the route names can be adjusted without changing UI components. 

|**Method & route**|**Purpose**|**Expected result**|
|---|---|---|
|**GET /api/conversations**|List history|Conversation summaries: id, title,<br>updatedAt, optional preview|
|**POST /api/conversations**|Create conversation|Conversation object with id and title|
|**GET /api/conversations/:id**|Get conversation|Conversation metadata and<br>messages|
|**PATCH /api/conversations/:id**|Rename/update|Updated conversation metadata|
|**DELETE /api/conversations/:id**|Delete conversation|Success status|
|**POST**|Send message|JSON response or a documented|
|**/api/conversations/:id/messages**||streaming response|
|**POST /api/uploads**|Upload attachment|Attachment id, name, mimeType,<br>size,status|



RecallAI • Frontend Product & Functional Specification 

|**GET /api/conversations/:id/context**|Get study context|Relevant goals/topics/mistakes and<br>short explanation of relevance|
|---|---|---|
|**POST /api/messages/:id/feedback**|Record answer feedback|Acknowledgement|
|**DELETE /api/memories/:id**|Remove memory|Acknowledgement, only if memory<br>management is supported|



#### **Suggested send-message payload** 

{ "content": "Explain Newton's second law with an example.", "attachmentIds": ["upload-id-1"], "responseMode": "study" } **Suggested response shape** { "conversationId": "conversation-id", "userMessage": { "id": "message-id", "role": "user", "content": "..." }, "assistantMessage": { "id": "message-id", "role": "assistant", "content": "...", "createdAt": "ISO-8601 timestamp" }, "studyContext": [ { "id": "memory-id", "type": "goal|topic|mistake|preference", "label": "Current study goal", "summary": "...", "updatedAt": "ISO-8601 timestamp" } ] } 

If streaming is implemented, document the exact event format (for example, message_start, token/delta, context, done, error) and cancellation behavior. Do not build the frontend around an undocumented assumption about SSE/WebSocket events. 

## **11. Data types (frontend-facing)** 

type Conversation = { id: string; title: string; updatedAt: string; preview?: string; }; type Attachment = { id?: string; name: string; mimeType: string; size: number; kind: "document" | "image"; status: "queued" | "uploading" | "processing" | "ready" | "failed"; previewUrl?: string; error?: string; }; type ChatMessage = { 

RecallAI • Frontend Product & Functional Specification 

id: string; role: "user" | "assistant" | "system"; content: string; createdAt: string; attachments?: Attachment[]; status?: "sending" | "streaming" | "complete" | "error"; }; type StudyMemory = { id: string; type: "goal" | "topic" | "mistake" | "preference" | "study_session"; label: string; summary: string; updatedAt?: string; source?: string; }; 

## **12. Error, loading, and edge cases** 

|**Situation**|**UI response**|
|---|---|
|**History loading**|Skeleton rows or lightweight spinner; keep the layout<br>stable.|
|**No conversations**|Welcome state and New chat action.|
|**Conversation load failure**|Show a retry action; do not clear the selected ID silently.|
|**Message send failure**|Mark the message as failed, preserve draft/prompt, and<br>provide Retry.<br>f|
|**Streaming disconnect**|Keep partial text, label the response interrupted, and offer<br>retry/regenerate.|
|**Upload failure**<br>**i**|Mark only the failed attachment; let the user retry or<br>remove it.<br>i|
|**Unsupported/oversize file**|Explain the specific reason before upload when possible.|
|**No study memory**|Show an honest empty state; the chat must still work<br>normally.<br>l|
|**Stale conversation**|Refresh or show a conflict message if the conversation<br>changed elsewhere.|
|**Very long response**|Keep controls accessible and support normal page<br>scrolling.|
|**Mobile keyboard**|Keep composer visible and ensure send/upload controls<br>remain reachable.|
|**Unauthorized API response**|Show a sign-in/session message only if authentication<br>exists;do not fake account behavior.|



## **13. Accessibility, privacy, and security** 

- All icon-only buttons need accessible names; dialogs must trap focus and return focus when closed. 

- Use semantic buttons, inputs, labels, and headings; do not use clickable divs for core actions. 

- Announce new assistant output and errors appropriately without announcing every streamed token excessively. 

- Never store API secrets, FalkorDB credentials, or LLM provider keys in frontend source or public environment variables. 

- Upload and parse files through the backend; enforce file type and size limits server-side. 

- Render model-generated Markdown safely. Do not run model output as JavaScript or trust arbitrary HTML. 

- Show a clear deletion confirmation before removing a conversation or memory. 

- Avoid claiming the AI has remembered something until the backend confirms that memory was saved. 

- Provide user-visible failure feedback if a memory update fails; do not silently claim persistence. 

RecallAI • Frontend Product & Functional Specification 

## **14. Recommended project structure** 

recallai/ 

- ├── apps/ 

│├── web/ ││├── src/ │││├── app/ │││├── components/ ││││├── layout/ ││││├── chat/ ││││├── uploads/ ││││└── study-context/ │││├── pages/ or routes/ │││├── hooks/ │││├── lib/api/ │││├── types/ │││└── styles/ ││└── package.json │└── api/ │ ├── src/ │ │├── routes/ │ │├── controllers/ │ │├── services/ │ │├── memory/ │ │└── server.ts │ └── package.json ├── packages/ 

- │└── shared-types/ ├── docs/ └── README.md 

The frontend may be built first with mock data, but isolate mock services behind the same API functions that will later call Express. This avoids rewriting components when the real backend becomes available. 

## **15. Build plan in priority order** 

|**Phase**|**Build**|**Done when**|
|---|---|---|
|**P0 — Visual shell**|Responsive sidebar, header, main<br>chat area, composer, welcome state,<br>basic message bubbles.|The interface feels coherent with<br>hard-coded sample conversations.|
|**P0 — Local interactions**|New chat, select history item,<br>type/send message into a mock<br>assistant response, attachment<br>selection and previews.|The complete user journey can be<br>demonstrated without a backend.|
|**P0 — API boundary**|Central API client, typed<br>request/response models,<br>environment-based API URL,<br>loading/error states.|UI components do not make ad hoc<br>network calls.|
|**P0 — Real chat**|Connect conversation list, load<br>conversation, send message, and<br>render backend response.|A real message round-trip works<br>through Express.|
|**P0 — Uploads**|Upload files/images, display status,<br>attach uploaded IDs to message<br>send.|Backend confirms accepted files and<br>errors are visible.|
|**P1 — Persistent history**|Create/rename/delete, search,<br>history grouping.|History survives reload through<br>backendpersistence.|



RecallAI • Frontend Product & Functional Specification 

|**P1 — Streaming**|Render incremental response chunks|Streaming works with documented|
|---|---|---|
||and handle interrupted generation.|API events.|
|**P1 — Study context**|Context panel and memory-source<br>labels from API response.|User can inspect the context used by<br>a recommendation.|
|**P2 — Polish**|Feedback, regenerate, settings, dark<br>i|All controls have real behavior or are|
||mode, mobile refinements, memory|clearly marked unavailable.|
||correction/removal.||



## **16. MVP acceptance checklist** 

- ☐ I can start a new conversation. 

- ☐ I can see and select conversation history. 

- ☐ I can type a message and send it. 

- ☐ I can attach a document and an image from separate visible controls. 

- ☐ I can preview and remove an attachment before sending. 

- ☐ I can see upload, processing, and failure states. 

- ☐ I can tell when the assistant is generating, finished, or failed. 

- ☐ I can retry a failed request without retyping everything. 

- ☐ I can refresh the page and recover conversations once backend persistence is connected. 

- ☐ The app never exposes database or LLM credentials in the browser. 

- ☐ The interface works at laptop and mobile widths. 

- ☐ Memory/context UI displays only information returned by the backend and does not invent memories. 

## **17. Example demo flow** 

10. Open RecallAI and click “Quiz me on a topic”. 

11. Ask a physics or programming question and receive a step-by-step explanation. 

12. Upload a page/photo of study notes and ask the assistant to explain the relevant section. 

13. Ask for a short quiz based on the explanation. 

14. Answer one question incorrectly; the backend may record the topic and misconception if that feature is implemented. 

15. Start a later conversation and ask for a revision recommendation. 

16. Open Study Context to see the relevant topic/mistake that influenced the recommendation, if returned by the backend. 

For a hackathon demo, seed deterministic sample history and sample memory on the backend. Label any demo-only data clearly, and avoid presenting mock memory as a real user’s saved learning history. 

## **18. Implementation decisions to confirm before coding** 

- Frontend stack: React + TypeScript + Vite, or Next.js if there is a clear reason to use it. 

- Styling: Tailwind CSS or CSS modules. 

RecallAI • Frontend Product & Functional Specification 

- Backend route contract and whether assistant responses stream via SSE, WebSocket, or normal JSON. 

- Upload size limits, supported file formats, and whether multiple files can be sent together. 

- Whether authentication is in MVP or deferred. 

- Which study-memory fields the backend can reliably return in the first demo. 

## **19. Final instruction to the frontend builder** 

Build the interface as a polished chat app first, then connect real data through a typed API layer. Keep the chat usable even when the memory panel is empty or the graph service is temporarily unavailable. Make file/image uploads visible and reliable. The defining RecallAI feature is not a decorative graph; it is that useful learning context can influence a later answer, and the interface can explain that connection in plain language. 

RecallAI • Frontend Product & Functional Specification 

