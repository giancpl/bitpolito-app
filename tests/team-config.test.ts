import { describe, expect, it } from "vitest";
import { decodePubkey, parsePubkeyList, resolveTeamAuthority } from "../shared/team-config";

const NPUB = "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg";
const HEX = "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e";
const OTHER_HEX = "a".repeat(64);

describe("team-config", () => {
  it("decodes npub and hex pubkeys and rejects invalid strings", () => {
    expect(decodePubkey(NPUB)).toBe(HEX);
    expect(decodePubkey(HEX.toUpperCase())).toBe(HEX);
    expect(decodePubkey("")).toBeNull();
    expect(decodePubkey("npub1invalid")).toBeNull();
  });

  it("parses comma/whitespace separated admin lists and includes owner in authority", () => {
    expect(parsePubkeyList(` ${NPUB}, ${OTHER_HEX} , invalid `)).toEqual([HEX, OTHER_HEX]);
    const authority = resolveTeamAuthority(NPUB, OTHER_HEX);
    expect(authority.ownerPubkey).toBe(HEX);
    expect(authority.adminPubkeys).toEqual(expect.arrayContaining([HEX, OTHER_HEX]));
  });
});
