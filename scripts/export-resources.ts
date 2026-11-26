/** Read-only legacy export. Never exports identities, credentials or operational history. */
import Database from "better-sqlite3";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
const args = process.argv.slice(2);
const source = args[args.indexOf("--database") + 1],
  output = args[args.indexOf("--output") + 1];
if (!args.includes("--database") || !args.includes("--output") || !source || !output)
  throw Error(
    "Usage: npm run resources:export -- --database data/bitpolito.sqlite --output artifacts/resources.json",
  );
const db = new Database(resolve(source), { readonly: true, fileMustExist: true });
try {
  const resources = db
    .prepare("SELECT id,title,description,type,category,url,status,icon FROM resources ORDER BY id")
    .all();
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(
    resolve(output),
    JSON.stringify({ format: "bitpolito.resources.v1", resources }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    `Exported ${resources.length} resources to ${resolve(output)}. Review them before publishing to the encrypted team.`,
  );
} finally {
  db.close();
}
