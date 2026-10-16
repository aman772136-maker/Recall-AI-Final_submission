import {
  ALLOWED_UPLOAD_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type AllowedType,
  type Attachment,
} from "@recallai/shared-types";

/**
 * Client-side validation for fast feedback. The backend must validate again —
 * nothing here is a security boundary.
 */

export function specFor(file: File): AllowedType | undefined {
  const name = file.name.toLowerCase();
  return ALLOWED_UPLOAD_TYPES.find((t) => t.extensions.some((e) => name.endsWith(e)));
}

export function validateFile(file: File): string | null {
  const spec = specFor(file);
  if (!spec) {
    return `${file.name}: unsupported type. Allowed: ${ALLOWED_UPLOAD_TYPES.map((t) => t.label).join(", ")}.`;
  }
  if (file.size === 0) return `${file.name}: the file is empty.`;
  if (file.size > spec.maxBytes) {
    return `${file.name} is ${formatBytes(file.size)}. The limit for ${spec.label} is ${formatBytes(spec.maxBytes)}.`;
  }
  return null;
}

export function canAddMore(current: number): string | null {
  return current >= MAX_ATTACHMENTS_PER_MESSAGE
    ? `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`
    : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const LOCAL = new Map<string, Attachment>();

/** Registers a browser-only attachment so it can be rendered before upload. */
export function trackLocal(file: File): Attachment {
  const spec = specFor(file);
  const record: Attachment = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind: spec?.kind ?? "document",
    status: "queued",
    progress: 0,
    local: true,
    previewUrl:
      spec?.kind === "image" ? URL.createObjectURL(file) : undefined,
  };
  LOCAL.set(keyFor(record), record);
  return record;
}

function keyFor(a: Attachment) {
  return `${a.name}:${a.size}:${a.local ? "local" : (a.id ?? "")}`;
}

export function mergeLocal(
  incoming: Attachment[],
  local: Attachment[],
): Attachment[] {
  const byKey = new Map(local.map((a) => [keyFor(a), a]));
  const out = incoming.map((a) => {
    const l = byKey.get(keyFor(a));
    return l ? { ...a, previewUrl: a.previewUrl ?? l.previewUrl } : a;
  });
  return [...out, ...local.filter((l) => !incoming.some((a) => keyFor(a) === keyFor(l)))];
}

export function revokePreview(a: Attachment) {
  if (a.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(a.previewUrl);
}