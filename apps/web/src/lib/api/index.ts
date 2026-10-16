import { HttpApi } from "./http";
import { createMockApi } from "./mock";
import type { RecallApi } from "./types";

/**
 * The one place the transport is chosen.
 *
 *   NEXT_PUBLIC_API_URL=""    → in-memory mock (no backend needed)
 *   NEXT_PUBLIC_API_URL="…"   → Express
 *
 * Nothing outside this file knows which one is active.
 */
function build(): RecallApi {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim();
  return base ? new HttpApi(base.replace(/\/$/, "")) : createMockApi();
}

export const api: RecallApi = build();
export const USING_MOCK = !process.env.NEXT_PUBLIC_API_URL?.trim();
export { ApiError } from "./types";
export type { RecallApi } from "./types";