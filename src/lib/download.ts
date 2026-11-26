import { isAndroid, Native } from "./native";

/** Saves text through the Android document picker or a browser download. */
export async function downloadText(content: string, name: string, type = "text/plain") {
  if (isAndroid) {
    await Native.exportBackup({ content, name });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const backupName = (pubkey: string) => `bitpolito-${pubkey.slice(0, 8)}.ncryptsec`;
