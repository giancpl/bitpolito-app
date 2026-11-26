import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "./schema.js";

export const now = () => Math.floor(Date.now() / 1000);
export function openDatabase(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(resolve(dataDir, "app.sqlite"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve("migrations") });
  return { sqlite, db };
}
export type Store = ReturnType<typeof openDatabase>;
