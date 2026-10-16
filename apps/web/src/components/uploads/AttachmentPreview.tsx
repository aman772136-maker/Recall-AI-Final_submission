"use client";

import { useState } from "react";
import { FileText, RefreshCw, X } from "lucide-react";
import type { Attachment } from "@recallai/shared-types";
import { formatBytes } from "@/lib/files";

/**
 * The frontend never renders a whole document. It shows what the browser
 * knows — name, type, size, upload state — and the server's processing state.
 * "Ready" means the backend accepted it, not that its contents are in context.
 */

function statusLabel(a: Attachment) {
  switch (a.status) {
    case "queued":
      return "Queued";
    case "uploading":
      return `Uploading ${a.progress ?? 0}%`;
    case "processing":
      return "Processing…";
    case "ready":
      return a.kind === "image" ? "Image ready" : "Ready";
    case "failed":
      return a.error ?? "Failed";
    default:
      return "";
  }
}

export function AttachmentPreview({
  attachment,
  onRemove,
  onRetry,
}: {
  attachment: Attachment;
  onRemove?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="att" data-kind={attachment.kind} data-status={attachment.status}>
      {attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="att-thumb"
          src={attachment.previewUrl}
          alt={attachment.name}
          onClick={() => window.open(attachment.previewUrl, "_blank")}
        />
      ) : (
        <span className="att-icon">
          <FileText size={16} />
        </span>
      )}

      <span className="att-info">
        <span className="att-name" title={attachment.name}>
          {attachment.name}
        </span>
        <span className="att-sub">
          {attachment.status === "uploading" ? (
            <span className="att-bar">
              <i style={{ width: `${attachment.progress ?? 0}%` }} />
            </span>
          ) : null}
          {formatBytes(attachment.size)} · {statusLabel(attachment)}
        </span>
      </span>

      {attachment.status === "failed" && onRetry && (
        <button
          type="button"
          className="att-remove"
          style={{ right: 28 }}
          onClick={onRetry}
          aria-label={`Retry ${attachment.name}`}
        >
          <RefreshCw size={13} />
        </button>
      )}

      {onRemove && (
        <button
          type="button"
          className="att-remove"
          onClick={onRemove}
          aria-label={`Remove ${attachment.name}`}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/** Larger, click-through preview for a sent image. */
export function ImagePreview({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = useState(false);
  if (!attachment.previewUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "block",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--hairline-2)",
          maxWidth: 320,
          cursor: "zoom-in",
        }}
        aria-label={`Open ${attachment.name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          style={{ width: "100%", display: "block" }}
        />
      </button>
      {open && (
        <div
          className="dialog-veil"
          role="dialog"
          aria-modal="true"
          aria-label={attachment.name}
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.previewUrl}
            alt={attachment.name}
            style={{
              maxWidth: "min(92vw, 900px)",
              maxHeight: "86vh",
              borderRadius: 16,
              objectFit: "contain",
            }}
          />
        </div>
      )}
    </>
  );
}