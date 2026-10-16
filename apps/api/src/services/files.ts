import { readFile, unlink, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";

/**
 * File handling.
 *
 * Hard rules from the spec:
 *  - uploads are untrusted input; nothing here executes or interprets content
 *  - validation happens server-side regardless of what the browser did
 *  - the frontend renders the processing state, so this module must actually
 *    produce one: `ready` means extraction finished, not that we guessed
 *
 * Text extraction covers plain text and Markdown. PDF, DOCX and images need a
 * real parser; rather than pretend, those are marked `processing` and reported
 * honestly as not-yet-extracted. That is the seam for OCR / pdf-parse.
 */
export interface StoredFile {
  path: string;
  bytes: number;
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function saveFile(
  dir: string,
  originalName: string,
  buffer: Buffer,
): Promise<StoredFile> {
  await ensureDir(dir);
  const safeExt = extname(originalName).toLowerCase().slice(0, 12);
  const stored = `${randomUUID()}${safeExt}`;
  const full = join(dir, stored);
  await writeFile(full, buffer);
  return { path: full, bytes: buffer.byteLength };
}

export async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    /* already gone */
  }
}

export type ExtractionResult =
  | { ok: true; text: string; chars: number }
  | { ok: false; reason: string };

/** Extracts text from a stored file, or explains why it could not. */
export async function extractText(
  filePath: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const isText = mimeType.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(filePath);

  if (isText) {
    try {
      const raw = await readFile(filePath, "utf8");
      // Strip control characters; keep the content otherwise intact.
      const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
      return { ok: true, text, chars: text.length };
    } catch (err) {
      return { ok: false, reason: `Could not read the file: ${String(err)}` };
    }
  }

  if (mimeType === "application/pdf" || /\.pdf$/i.test(filePath)) {
    return {
      ok: false,
      reason: "PDF text extraction is not wired up yet. Install a PDF parser in services/extract.ts.",
    };
  }

  if (mimeType.startsWith("image/")) {
    return {
      ok: false,
      reason: "Image text extraction needs OCR, which is not wired up yet.",
    };
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return {
      ok: false,
      reason: "DOCX text extraction is not wired up yet.",
    };
  }

  return { ok: false, reason: `No extractor for ${mimeType || "this file type"}.` };
}