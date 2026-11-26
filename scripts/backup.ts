import { readConfig } from "../server/config.js";
import { openDatabase } from "../server/db.js";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
const args = process.argv.slice(2),
  restore = args.includes("--restore");
const target = args.find((v) => !v.startsWith("--"));
if (!target)
  throw new Error(
    "Provide a database backup path. Stop the app before restoring; back up the uploads directory separately.",
  );
const config = readConfig();
if (restore) {
  const source = resolve(target),
    destination = resolve(config.dataDir, "app.sqlite");
  if (source === destination)
    throw new Error("The backup must be a separate file");
  if (existsSync(`${destination}-wal`) || existsSync(`${destination}-shm`))
    throw new Error(
      "Stop the app and close all database connections before restoring. A WAL/shared-memory file is still present.",
    );
  const backup = new Database(source, { readonly: true, fileMustExist: true });
  try {
    const result = backup.pragma("quick_check") as { quick_check: string }[];
    if (
      result.some((r) => r.quick_check !== "ok") ||
      !backup
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
        )
        .get()
    )
      throw new Error("This is not a valid BitPolito database backup");
  } finally {
    backup.close();
  }
  await mkdir(config.dataDir, { recursive: true });
  const temporary = `${destination}.restore-${randomUUID()}`;
  try {
    await copyFile(source, temporary);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log("Database restored. Keep matching uploads and restart the app.");
} else {
  const { sqlite } = openDatabase(config.dataDir);
  await sqlite.backup(resolve(target));
  sqlite.close();
  console.log(
    "Consistent database backup created. Also copy data/uploads for a complete backup.",
  );
}
