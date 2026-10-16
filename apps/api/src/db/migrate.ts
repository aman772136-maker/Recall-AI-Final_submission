import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { config } from "../config.js";

/**
 * Applies schema.sql. Safe to re-run: every statement is IF NOT EXISTS or
 * CREATE OR REPLACE.
 *
 *   npm run migrate -w @recallai/api
 */
const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  if (config.usingMemoryStore) {
    console.error("DATABASE_URL is empty. Nothing to migrate.");
    process.exit(1);
  }

  const sql = await readFile(resolve(here, "schema.sql"), "utf8");
  const pool = new Pool({ connectionString: config.databaseUrl });

  try {
    console.log("[migrate] applying schema…");
    await pool.query(sql);
    console.log("[migrate] done.");
  } catch (err) {
    console.error("[migrate] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();