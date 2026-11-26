// Public, disposable fixtures. Imported only by the local sandbox and its tests.
export const sandboxProfiles = [
  { id: "alice", name: "Alice", role: "admin", key: 1, port: 5180 },
  { id: "bob", name: "Bob", role: "member", key: 2, port: 5181 },
  { id: "cara", name: "Cara", role: "member", key: 3, port: 5182 },
  { id: "drew", name: "Drew", role: "follower", key: 6, port: 5183 },
] as const;
export type SandboxProfile = (typeof sandboxProfiles)[number];
export function sandboxKey(n: number) {
  const key = new Uint8Array(32);
  key[31] = n;
  return key;
}
export const sandboxOrigin = (profile: SandboxProfile) => `http://127.0.0.1:${profile.port}`;
