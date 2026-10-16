import { Pool, type PoolClient } from "pg";
import type {
  Attachment,
  ChatMessage,
  Conversation,
  MessageFeedback,
  StudyMemory,
} from "@recallai/shared-types";
import type { AttachmentPatch, NewAttachment, NewMemory, StoredMessage } from "../types.js";
import type { Repository } from "./repository.js";

/**
 * Postgres implementation. Works against Neon over the pooled connection
 * string, or a local Postgres.
 */
export class PgRepository implements Repository {
  readonly kind = "postgres" as const;
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      // Neon pooled endpoints recycle connections; keep the idle window short
      // so we never hold a dead socket.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      max: 10,
      ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    });
  }

  async init(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /* ------------------------------------------------------------------ */
  /* Conversations                                                       */
  /* ------------------------------------------------------------------ */

  async listConversations(userId?: string): Promise<Conversation[]> {
    const { rows } = await this.pool.query<Conversation>(
      `SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM conversations
        ORDER BY updated_at DESC
        LIMIT 200`,
    );
    return rows;
  }

  async createConversation(title = "New conversation", userId?: string): Promise<Conversation> {
    const { rows } = await this.pool.query<Conversation>(
      `INSERT INTO conversations (title)
            VALUES ($1)
         RETURNING id, title, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [title],
    );
    return rows[0]!;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const { rows } = await this.pool.query<Conversation>(
      `SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM conversations WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async renameConversation(id: string, title: string): Promise<Conversation | null> {
    const { rows } = await this.pool.query<Conversation>(
      `UPDATE conversations
          SET title = $2, updated_at = now()
        WHERE id = $1
      RETURNING id, title, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, title],
    );
    return rows[0] ?? null;
  }

  async deleteConversation(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM conversations WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  /* ------------------------------------------------------------------ */
  /* Messages                                                            */
  /* ------------------------------------------------------------------ */

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const { rows } = await this.pool.query<ChatMessageRow>(
      `SELECT id, role, content, status, error, created_at AS "createdAt"
         FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC, id ASC`,
      [conversationId],
    );

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const [atts, mems] = await Promise.all([
      this.listAttachmentsByMessageIds(ids),
      this.memoriesForMessages(ids),
    ]);

    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      status: r.status,
      error: r.error ?? undefined,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      attachments: atts.get(r.id),
      studyContext: mems.get(r.id),
      contextNote: undefined,
    }));
  }

  async addMessage(message: StoredMessage): Promise<StoredMessage> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<ChatMessageRow>(
        `INSERT INTO messages (id, conversation_id, role, content, status, error)
              VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, role, content, status, error, created_at AS "createdAt"`,
        [
          message.id,
          message.conversationId,
          message.role,
          message.content,
          message.status ?? "complete",
          message.error ?? null,
        ],
      );
      const saved = rows[0]!;

      for (const a of message.attachments ?? []) {
        if (!a.id) continue;
        await client.query(
          `UPDATE attachments
              SET message_id = $2, conversation_id = $3
            WHERE id = $1`,
          [a.id, message.id, message.conversationId],
        );
      }

      if (message.studyContext?.length) {
        for (const mem of message.studyContext) {
          await client.query(
            `INSERT INTO message_memories (message_id, memory_id)
                  VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [message.id, mem.id],
          );
        }
      }

      await client.query("COMMIT");
      return {
        ...message,
        id: saved.id,
        status: saved.status,
        createdAt:
          saved.createdAt instanceof Date ? saved.createdAt.toISOString() : String(saved.createdAt),
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async updateMessage(
    id: string,
    value: Partial<Pick<ChatMessage, "content" | "status">> & { error?: string | null },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE messages
          SET content = COALESCE($2, content),
              status  = COALESCE($3, status),
              error   = $4
        WHERE id = $1`,
      [id, value.content ?? null, value.status ?? null, value.error ?? null],
    );
  }

  /* ------------------------------------------------------------------ */
  /* Attachments                                                         */
  /* ------------------------------------------------------------------ */

  async createAttachment(
    value: NewAttachment,
  ): Promise<Attachment> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `INSERT INTO attachments
         (conversation_id, name, mime_type, size, kind, status, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        value.conversationId ?? null,
        value.name,
        value.mimeType,
        value.size,
        value.kind,
        value.status,
        value.storagePath ?? null,
      ],
    );
    return toAttachment(rows[0]!);
  }

  async updateAttachment(
    id: string,
    value: AttachmentPatch,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE attachments
          SET status          = COALESCE($2, status),
              error           = $3,
              extracted_text  = COALESCE($4, extracted_text),
              extracted_chars = COALESCE($5, extracted_chars),
              message_id      = COALESCE($6, message_id)
        WHERE id = $1`,
      [
        id,
        value.status ?? null,
        value.error ?? null,
        value.extractedText ?? null,
        value.extractedChars ?? null,
        value.messageId ?? null,
      ],
    );
  }

  async getAttachment(id: string) {
    const { rows } = await this.pool.query<AttachmentRow & { storage_path: string | null; extracted_text: string | null }>(
      `SELECT * FROM attachments WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    return {
      ...toAttachment(rows[0]),
      storagePath: rows[0].storage_path ?? undefined,
      extractedText: rows[0].extracted_text ?? undefined,
    };
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM attachments WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async listAttachments(conversationId: string): Promise<Attachment[]> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `SELECT * FROM attachments WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows.map(toAttachment);
  }

  private async listAttachmentsByMessageIds(ids: string[]) {
    const { rows } = await this.pool.query<AttachmentRow>(
      `SELECT * FROM attachments WHERE message_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
      [ids],
    );
    const map = new Map<string, Attachment[]>();
    for (const row of rows) {
      const a = toAttachment(row);
      const list = map.get(row.message_id ?? "") ?? [];
      list.push(a);
      map.set(row.message_id ?? "", list);
    }
    return map;
  }

  /* ------------------------------------------------------------------ */
  /* Memories                                                            */
  /* ------------------------------------------------------------------ */

  async listMemories(conversationId?: string, userId?: string): Promise<StudyMemory[]> {
    const { rows } = await this.pool.query<MemoryRow>(
      conversationId
        ? `SELECT * FROM memories WHERE conversation_id = $1 ORDER BY updated_at DESC`
        : `SELECT * FROM memories ORDER BY updated_at DESC`,
      conversationId ? [conversationId] : [],
    );
    return rows.map(toMemory);
  }

  async upsertMemory(
    value: NewMemory,
  ): Promise<StudyMemory> {
    // Reuse an identical memory rather than accumulating duplicates.
    const { rows: existing } = await this.pool.query<MemoryRow>(
      `SELECT * FROM memories
        WHERE type = $1 AND summary = $2
        LIMIT 1`,
      [value.type, value.summary],
    );
    if (existing[0]) {
      const { rows } = await this.pool.query<MemoryRow>(
        `UPDATE memories
            SET keywords = memories.keywords || $2::text[],
                updated_at = now(),
                conversation_id = COALESCE($3, conversation_id)
          WHERE id = $1
        RETURNING *`,
        [existing[0].id, value.keywords, value.conversationId ?? null],
      );
      return toMemory(rows[0]!);
    }

    const { rows } = await this.pool.query<MemoryRow>(
      `INSERT INTO memories (conversation_id, message_id, type, label, summary, source, keywords)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
      [
        value.conversationId ?? null,
        value.messageId ?? null,
        value.type,
        value.label,
        value.summary,
        value.source ?? "learned",
        value.keywords,
      ],
    );
    return toMemory(rows[0]!);
  }

  async deleteMemory(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM memories WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async findMemoriesByKeywords(keywords: string[], limit: number, userId?: string): Promise<StudyMemory[]> {
    if (keywords.length === 0) return [];
    const { rows } = await this.pool.query<MemoryRow>(
      `SELECT * FROM memories
        WHERE keywords && $1::text[]
        ORDER BY updated_at DESC
        LIMIT $2`,
      [keywords, limit],
    );
    return rows.map(toMemory);
  }

  async linkMemoriesToMessage(messageId: string, memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) return;
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const id of memoryIds) {
        await client.query(
          `INSERT INTO message_memories (message_id, memory_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
          [messageId, id],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async memoriesForMessage(messageId: string): Promise<StudyMemory[]> {
    const { rows } = await this.pool.query<MemoryRow>(
      `SELECT m.* FROM memories m
         JOIN message_memories mm ON mm.memory_id = m.id
        WHERE mm.message_id = $1`,
      [messageId],
    );
    return rows.map(toMemory);
  }

  async memoriesForMessages(ids: string[]) {
    const { rows } = await this.pool.query<MemoryRow>(
      `SELECT m.*, mm.message_id AS linked_message
         FROM memories m
         JOIN message_memories mm ON mm.memory_id = m.id
        WHERE mm.message_id = ANY($1::uuid[])`,
      [ids],
    );
    const map = new Map<string, StudyMemory[]>();
    for (const row of rows) {
      const key = row.linked_message ?? "";
      const list = map.get(key) ?? [];
      list.push(toMemory(row));
      map.set(key, list);
    }
    return map;
  }

  /** The plain-language reason, stored alongside the answer. */
  async contextNoteForMessage(messageId: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ note: string | null }>(
      `SELECT note FROM message_context_notes WHERE message_id = $1`,
      [messageId],
    );
    return rows[0]?.note ?? undefined;
  }

  async setContextNote(messageId: string, note: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO message_context_notes (message_id, note)
            VALUES ($1, $2)
         ON CONFLICT (message_id) DO UPDATE SET note = EXCLUDED.note`,
      [messageId, note],
    );
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  async setFeedback(messageId: string, value: MessageFeedback): Promise<void> {
    await this.pool.query(
      `INSERT INTO feedback (message_id, value) VALUES ($1, $2)
         ON CONFLICT (message_id) DO UPDATE SET value = EXCLUDED.value, created_at = now()`,
      [messageId, value],
    );
  }
}

/* ------------------------------------------------------------------ */
/* Row shapes and mappers                                              */
/* ------------------------------------------------------------------ */

interface ChatMessageRow {
  id: string;
  role: ChatMessage["role"];
  content: string;
  status: ChatMessage["status"];
  error: string | null;
  createdAt: Date | string;
}

interface AttachmentRow {
  id: string;
  conversation_id: string | null;
  message_id: string | null;
  name: string;
  mime_type: string;
  size: string | number;
  kind: Attachment["kind"];
  status: Attachment["status"];
  error: string | null;
}

interface MemoryRow {
  id: string;
  type: StudyMemory["type"];
  label: string;
  summary: string;
  source: StudyMemory["source"];
  updated_at: Date | string;
  linked_message?: string;
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: Number(row.size),
    kind: row.kind,
    status: row.status,
    error: row.error ?? undefined,
    local: false,
  };
}

function toMemory(row: MemoryRow): StudyMemory {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    summary: row.summary,
    source: row.source,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}