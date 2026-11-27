import { decode } from "nostr-tools/nip19";

/**
 * Known BitPolito team owner and bootstrap administrators.
 * Set `VITE_OWNER_NPUB` / `VITE_ADMIN_NPUBS` (or edit these defaults) with `npub1…`
 * or 64-char hex public keys. When configured:
 * - Only the owner or listed admins can bootstrap/create the official team.
 * - Listed admins are promoted to administrator automatically upon joining.
 * - The owner cannot be demoted or removed.
 */
export const DEFAULT_OWNER_NPUB = (import.meta.env?.VITE_OWNER_NPUB as string | undefined) || "";
export const DEFAULT_ADMIN_NPUBS = (import.meta.env?.VITE_ADMIN_NPUBS as string | undefined) || "";

const HEX_PUBKEY = /^[a-f0-9]{64}$/;

export function decodePubkey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (HEX_PUBKEY.test(trimmed.toLowerCase())) return trimmed.toLowerCase();
  try {
    const decoded = decode(trimmed);
    return decoded.type === "npub" ? decoded.data.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function parsePubkeyList(raw: string): string[] {
  const seen = new Set<string>();
  for (const entry of raw.split(/[\s,;]+/)) {
    const hex = decodePubkey(entry);
    if (hex) seen.add(hex);
  }
  return [...seen];
}

export function resolveTeamAuthority(
  ownerRaw = DEFAULT_OWNER_NPUB,
  adminsRaw = DEFAULT_ADMIN_NPUBS,
): { ownerPubkey: string | null; adminPubkeys: string[] } {
  const ownerPubkey = decodePubkey(ownerRaw);
  const admins = new Set(parsePubkeyList(adminsRaw));
  if (ownerPubkey) admins.add(ownerPubkey);
  return { ownerPubkey, adminPubkeys: [...admins] };
}
