import { registerPlugin } from "@capacitor/core";
import type { EventTemplate } from "nostr-tools/pure";
import { isAndroid, nativeEventData } from "./native";
import type { IdentitySigner } from "./signers";
import type { Invite, MooRequest, MooState, Resource, Role, User } from "../../shared/contracts";
import type { JoinApplication } from "../../shared/hub-contracts";

/** The browser preview runs a local simulator; the Android app runs the Marmot runtime. */
export const isPreview = import.meta.env.VITE_HUB_PREVIEW === "true";
export const hubEnabled = isAndroid || isPreview;

const bridge = registerPlugin<{
  execute(input: { action: string; input: Record<string, unknown> }): Promise<{ value: unknown }>;
  login(input: { pubkey: string; name?: string; invitation?: string }): Promise<{ ok: boolean }>;
  cryptoReply(input: { id: string; value?: string; error?: string }): Promise<void>;
}>("BitPolitoHub");

export interface HubClient {
  command<T>(action: string, input?: Record<string, unknown>): Promise<T>;
  connect(signer: IdentitySigner, name?: string): Promise<void>;
}

let signer: IdentitySigner | null = null;
export function clearHubSigner() {
  signer = null;
}
export function setHubSigner(next: IdentitySigner) {
  signer = next;
}

interface CryptoRequest {
  id: string;
  action: string;
  owner?: string;
  event: EventTemplate & { pubkey?: string };
  pubkey: string;
  content: string;
}

/** The native runtime asks the WebView to sign or encrypt with the unlocked identity. */
async function answerCryptoRequest(detail: CryptoRequest): Promise<string> {
  if (!signer) throw Error("Unlock your identity in the app to continue.");
  if (detail.owner && detail.owner !== signer.pubkey)
    throw Error("This identity is not connected.");
  switch (detail.action) {
    case "sign": {
      if ([0, 3].includes(detail.event.kind))
        throw Error("Public profile and contact publishing is disabled.");
      const { pubkey, ...template } = detail.event;
      if (pubkey && pubkey !== signer.pubkey)
        throw Error("Signer identity does not match this account.");
      return JSON.stringify(await signer.signEvent(template as EventTemplate));
    }
    case "encrypt":
      if (!signer.encrypt) throw Error("This signer does not support NIP-44 encryption.");
      return signer.encrypt(detail.pubkey, detail.content);
    case "decrypt":
      if (!signer.decrypt) throw Error("This signer does not support NIP-44 decryption.");
      return signer.decrypt(detail.pubkey, detail.content);
    default:
      throw Error("Unsupported identity operation.");
  }
}

if (isAndroid)
  window.addEventListener("bitpolito:crypto", (event) => {
    const detail = nativeEventData<CryptoRequest>(event);
    if (!detail || typeof detail.id !== "string") return;
    void answerCryptoRequest(detail).then(
      (value) => bridge.cryptoReply({ id: detail.id, value }),
      (error) => bridge.cryptoReply({ id: detail.id, error: (error as Error).message }),
    );
  });

// The env check must stay inline so Vite drops the simulator (and its public test keys)
// from Android builds entirely.
const simulator = () =>
  import.meta.env.VITE_HUB_PREVIEW === "true"
    ? import("./hub-simulator").then((m) => m.simulator)
    : Promise.reject(Error("The browser simulator is not part of this build."));

export const hub: HubClient = {
  async command<T>(action: string, input: Record<string, unknown> = {}) {
    if (isAndroid) return (await bridge.execute({ action, input })).value as T;
    if (isPreview) return (await simulator()).command<T>(action, input);
    throw Error("The encrypted team runtime is available in the Android app.");
  },
  async connect(next, name) {
    if (!next.encrypt || !next.decrypt)
      throw Error("Your signer needs NIP-44 support to join the encrypted team.");
    signer = next;
    try {
      if (isAndroid)
        await bridge.login({
          pubkey: next.pubkey,
          name,
          invitation: sessionStorage.getItem("bitpolito.invite") || undefined,
        });
      else if (isPreview) await (await simulator()).connect(next, name);
      else throw Error("Use the Android app to connect to your team.");
    } catch (e) {
      signer = null;
      throw e;
    }
  },
};

export type ConnectionState = "connected" | "syncing" | "reconnecting" | "paused" | "simulator";
export type RequestAction = "claim" | "release" | "inside" | "cancel";
export type ApplicationStatus =
  "none" | "pending" | "approved" | "declined" | "used" | "expired" | "revoked";
export interface HubConfiguration {
  transport: string;
  sandbox: boolean;
  relays: string[];
  signerRelays?: string[];
  timezone: string;
}
export type ResourceInput = Omit<Resource, "id" | "icon" | "updatedAt"> & {
  id?: string;
  icon?: string;
};

/** Typed operations of the encrypted team runtime (native Marmot or browser simulator). */
export const team = {
  configuration: () => hub.command<HubConfiguration>("configuration"),
  status: () => hub.command<{ state: ConnectionState; error: string | null }>("status"),
  me: () => hub.command<{ user: User | null }>("me"),
  logout: () => hub.command<void>("logout"),
  createTeam: () => hub.command<void>("createTeam"),
  saveProfile: (profile: { name: string; about: string }) => hub.command<void>("profile", profile),

  office: () => hub.command<MooState>("moo"),
  checkIn: () => hub.command<void>("presence", { action: "arrive" }),
  leave: () => hub.command<void>("presence", { action: "leave" }),
  ring: (key: string) => hub.command<MooRequest>("ring", { key }),
  respond: (id: string, action: RequestAction) =>
    hub.command<MooRequest>("request", { id, action }),
  alertSettings: (settings: { vibration: boolean }) => hub.command<void>("alertSettings", settings),

  resources: () => hub.command<Resource[]>("resources"),
  saveResource: (resource: ResourceInput) =>
    hub.command<Resource>("saveResource", resource as Record<string, unknown>),

  members: () => hub.command<User[]>("members"),
  setRole: (id: string, role: Role) => hub.command<void>("setRole", { id, role }),
  invites: () => hub.command<Invite[]>("invites"),
  createInvite: (label: string) => hub.command<{ token: string }>("createInvite", { label }),
  revokeInvite: (id: string) => hub.command<void>("revokeInvite", { id }),
  applications: () => hub.command<JoinApplication[]>("applications"),
  reviewApplication: (id: string, decision: "approve" | "decline", replace: boolean) =>
    hub.command<void>("reviewApplication", { id, decision, replace }),
  relays: () => hub.command<{ relays: string[] }>("relays"),
  setRelays: (relays: string[]) => hub.command<void>("setRelays", { relays }),

  join: (token: string) => hub.command<{ status: ApplicationStatus }>("join", { token }),
  joinStatus: () => hub.command<{ status: ApplicationStatus }>("joinStatus"),
  deviceReadiness: (token: string) =>
    hub.command<{ otherInstallations: number }>("deviceReadiness", { token }),
  preparePhone: (token: string) => hub.command<void>("preparePhone", { token, confirmed: true }),
};

/** Accepts a bare token or any invitation link (bitpolito://join#invite=…, https://…#invite=…). */
export function inviteToken(value: string) {
  const trimmed = value.trim();
  const match = /[#?&]invite=([^&\s]+)/.exec(trimmed);
  return match ? match[1] : trimmed;
}
export const inviteLink = (token: string) => `bitpolito://join#invite=${token}`;
