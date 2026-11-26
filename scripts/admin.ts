import { decode } from "nostr-tools/nip19";
import { pubkeySchema } from "../shared/contracts.js";
import { readConfig } from "../server/config.js";
import { openDatabase } from "../server/db.js";
const input = process.argv[2];
if (!input)
  throw Error("Usage: npm run admin:grant -- <npub-or-hex-public-key>");
const decoded = input.startsWith("npub1") ? decode(input) : null;
const key = pubkeySchema.parse(
  decoded ? (decoded.type === "npub" ? decoded.data : null) : input,
);
const { sqlite } = openDatabase(readConfig().dataDir);
sqlite
  .prepare(
    "INSERT INTO users (pubkey,name,role,created_at) VALUES (?,'Administrator','admin',?) ON CONFLICT(pubkey) DO UPDATE SET role='admin'",
  )
  .run(key, Math.floor(Date.now() / 1000));
sqlite.close();
console.log(
  "Administrator granted to the chosen public identity. Sign in with its signer.",
);
