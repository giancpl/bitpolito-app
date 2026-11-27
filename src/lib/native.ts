import { Capacitor, registerPlugin } from "@capacitor/core";

export const isAndroid = Capacitor.getPlatform() === "android";

/** Capacitor's triggerWindowJSEvent assigns data to the Event itself; browser CustomEvents use detail. */
export function nativeEventData<T>(event: Event): T {
  return ((event as CustomEvent<T>).detail ?? event) as T;
}

export interface AlertsStatus {
  permission: boolean;
  enabled: boolean;
  listening?: boolean;
  vibration?: boolean;
}

/** Device services of the Android shell: secure storage, NIP-55 signers, files and alerts. */
export const Native = registerPlugin<{
  configuration(): Promise<{ sandbox: boolean }>;
  logout(): Promise<void>;
  vaultRead(): Promise<{ value: string | null }>;
  vaultWrite(input: { value: string }): Promise<void>;
  vaultRemove(): Promise<void>;
  exportBackup(input: { content: string; name: string }): Promise<void>;
  importBackup(): Promise<{ content: string }>;
  signerKey(): Promise<{ pubkey: string }>;
  signerSign(input: { event: string }): Promise<{ event: string }>;
  signerCrypt(input: {
    type: "nip44_encrypt" | "nip44_decrypt";
    pubkey: string;
    content: string;
  }): Promise<{ content: string }>;
  alertsStatus(): Promise<AlertsStatus>;
  enableAlerts(): Promise<{ enabled: boolean }>;
  disableAlerts(): Promise<void>;
  testSound(): Promise<void>;
  settings(): Promise<void>;
  consumeRequest(): Promise<{ request?: string; invite?: string }>;
  background(): Promise<void>;
  openExternal(input: { url: string }): Promise<void>;
}>("BitPolito");
