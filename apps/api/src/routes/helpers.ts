import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";

/** Error with an HTTP status and a machine-readable code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Wraps an async handler so a rejected promise reaches the error middleware.
 * Express 4 does not do this on its own.
 */
export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Reads a route parameter, failing loudly rather than passing undefined down. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "invalid_body", `Missing route parameter: ${name}`);
  }
  return value;
}

/** Extracts user ID from x-user-id header or defaults to anonymous student. */
export function getUserId(req: Request): string {
  const header = req.headers["x-user-id"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }
  return "default_student";
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "No such route.", code: "not_found" });
}

/**
 * Single error translator. Never leaks a stack trace or a database message to
 * the client — that could disclose schema details.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  // Multer's own limit errors, so an oversize body is a 413 and not a 500.
  const multerCode = (err as { code?: string } | null)?.code;
  if (multerCode === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: "That file is larger than this server accepts.",
      code: "too_large",
    });
    return;
  }
  if (multerCode === "LIMIT_FILE_COUNT" || multerCode === "LIMIT_UNEXPECTED_FILE") {
    res.status(400).json({
      error: "Too many files in one request, or an unexpected file field.",
      code: "invalid_body",
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "The request body is not valid.",
      code: "invalid_body",
      fields: err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[api] unhandled error:", err);

  res.status(500).json({
    error: "The service hit an unexpected error.",
    code: "server",
    // Safe subset: enough to debug, not enough to leak the schema.
    detail: process.env.NODE_ENV === "production" ? undefined : message,
  });
}