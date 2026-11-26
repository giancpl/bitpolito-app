import { isAndroid, Native } from "./native";
import { hubEnabled, hubRequest } from './hub';
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if(hubEnabled)return hubRequest<T>(path,options.method||'GET',typeof options.body==='string'?options.body:undefined);
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("X-Bitpolito-Request", "1");
  if (isAndroid) {
    if (options.body && typeof options.body !== "string") throw Error("Unsupported Android request body");
    const result = await Native.request({path: `/api${path}`, method: options.method || "GET", body: options.body || undefined, headers: Object.fromEntries(headers.entries())});
    const data = JSON.parse(result.body);
    if (result.status < 200 || result.status >= 300) throw Error(data.error || "Request failed");
    return data as T;
  }
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The server returned an unexpected response" }));
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const remove = (path: string) => api(path, { method: "DELETE" });
export const displayName = (user: { name?: string; id: string }) =>
  user.name || "Local visitor";
export function formatDate(
  seconds: number,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "short",
    ...options,
  }).format(seconds * 1000);
}
export function relativeDate(seconds: number) {
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - seconds) / 60));
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : formatDate(seconds);
}
export async function downloadText(
  content: string,
  name: string,
  type = "text/plain",
) {
  if (isAndroid) { await Native.exportBackup({content, name}); return; }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toRomeInput(seconds: number) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(seconds * 1000);
  return parts.replace(" ", "T");
}
export function fromRomeInput(input: string) {
  const rough = Date.parse(`${input}:00Z`);
  let result = rough;
  for (let i = 0; i < 3; i++) {
    const rendered = Date.parse(`${toRomeInput(result / 1000)}:00Z`);
    result += rough - rendered;
  }
  if (toRomeInput(result / 1000) !== input)
    throw new Error(
      "This time does not exist in Europe/Rome because of daylight saving time",
    );
  return Math.floor(result / 1000);
}
