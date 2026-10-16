import { Router } from "express";
import multer from "multer";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type Attachment,
} from "@recallai/shared-types";
import type { Repository } from "../db/repository.js";
import { config } from "../config.js";
import { extractText, removeFile, saveFile } from "../services/files.js";
import { asyncRoute, HttpError, param } from "./helpers.js";

/**
 * Uploads.
 *
 * The browser validates first for fast feedback; this validates again because
 * the browser is not a security boundary. Files land on disk with a generated
 * name — the original name is metadata only, never a path segment.
 */
export function uploadsRouter(repo: Repository): Router {
  const r = Router();

  const upload = multer({
    limits: { fileSize: config.maxUploadBytes, files: MAX_ATTACHMENTS_PER_MESSAGE },
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
      const name = file.originalname.toLowerCase();
      const spec = ALLOWED_UPLOAD_TYPES.find((t) =>
        t.extensions.some((e) => name.endsWith(e)),
      );
      if (!spec) {
        cb(
          new HttpError(
            415,
            "unsupported_file",
            `${file.originalname}: ${file.mimetype || "that file type"} is not supported. Allowed: ${ALLOWED_UPLOAD_TYPES.map(
              (t) => t.label,
            ).join(", ")}.`,
          ),
        );
        return;
      }
      if (file.size > spec.maxBytes && !config.allowOversize) {
        cb(
          new HttpError(
            413,
            "too_large",
            `${file.originalname} is ${(file.size / 1048576).toFixed(1)} MB. The limit for ${spec.label} is ${(spec.maxBytes / 1048576).toFixed(0)} MB.`,
          ),
        );
        return;
      }
      cb(null, true);
    },
  });

  r.post(
    "/",
    upload.single("file"),
    asyncRoute(async (req, res) => {
      const file = req.file;
      if (!file) throw new HttpError(400, "invalid_body", "No file field in the request.");

      const name = file.originalname.toLowerCase();
      const spec = ALLOWED_UPLOAD_TYPES.find((t) => t.extensions.some((e) => name.endsWith(e)))!;

      const stored = await saveFile(config.uploadDir, file.originalname, file.buffer);

      const record = await repo.createAttachment({
        conversationId: typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined,
        name: file.originalname,
        mimeType: file.mimetype || "application/octet-stream",
        size: file.size,
        kind: spec.kind,
        status: "processing",
        storagePath: stored.path,
      });

      res.status(201).json({ ...record, status: "processing" } satisfies Attachment);

      // Extraction continues after the response. The UI is already showing
      // "processing" and will pick up `ready` when the message is sent.
      void (async () => {
        try {
          const result = await extractText(stored.path, file.mimetype || "");
          if (result.ok) {
            await repo.updateAttachment(record.id!, {
              status: "ready",
              error: null,
              extractedChars: result.chars,
              extractedText: result.text,
            });
          } else {
            // Not an error the user can act on for images/PDF yet: the file
            // is stored and its name is visible, we just have no text.
            await repo.updateAttachment(record.id!, {
              status: "ready",
              error: result.reason,
              extractedText: "",
            });
          }
        } catch (err) {
          await repo.updateAttachment(record.id!, {
            status: "failed",
            error: err instanceof Error ? err.message : "Processing failed.",
          });
          await removeFile(stored.path);
        }
      })();
    }),
  );

  r.delete(
    "/:id",
    asyncRoute(async (req, res) => {
      const att = await repo.getAttachment(param(req, "id"));
      if (!att) throw new HttpError(404, "not_found", "Attachment not found.");
      if (att.storagePath) await removeFile(att.storagePath);
      await repo.deleteAttachment(param(req, "id"));
      res.status(204).end();
    }),
  );

  return r;
}