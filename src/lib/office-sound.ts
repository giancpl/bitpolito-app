import { useSyncExternalStore } from "react";

type AudioSession = { type: string };
let audio: AudioContext | undefined;
let buffer: Promise<AudioBuffer> | undefined;
let decoded: AudioBuffer | undefined;
let active:
  | { source: AudioBufferSourceNode; key?: string; finish: () => void }
  | undefined;
let state: "off" | "locked" | "ready" =
  localStorage.getItem("bitpolito.moo.sound") === "true" ? "locked" : "off";
const listeners = new Set<() => void>();
function update(next: typeof state) {
  state = next;
  listeners.forEach((fn) => fn());
}
export function useOfficeSound() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}
export function vibrationSupported() {
  return typeof navigator.vibrate === "function";
}
export function vibrationEnabled() {
  return localStorage.getItem("bitpolito.moo.vibration") === "true";
}
function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* Optional device feedback. */
  }
}
export function setVibration(enabled: boolean) {
  localStorage.setItem("bitpolito.moo.vibration", String(enabled));
  if (!enabled) vibrate(0);
}
export function stopOfficeSound() {
  if (active) {
    const current = active;
    try {
      current.source.stop?.();
    } catch {
      /* Already ended. */
    }
    current.finish();
  }
  vibrate(0);
}
export function retainOfficeAlerts(keys: Set<string>) {
  if (active?.key && !keys.has(active.key)) stopOfficeSound();
}
export function disableSound() {
  localStorage.setItem("bitpolito.moo.sound", "false");
  stopOfficeSound();
  update("off");
}
export async function testSound(withVibration = false) {
  localStorage.setItem("bitpolito.moo.sound", "true");
  try {
    audio ??= new AudioContext();
    audio.onstatechange = () => {
      if (audio?.state !== "running") stopOfficeSound();
      if (state !== "off")
        update(audio?.state === "running" && decoded ? "ready" : "locked");
    };
    // Resume synchronously from the tap, before fetching/decoding.
    const resumed = audio.resume();
    buffer ??= fetch("/audio/mudchute-cow.mp3")
      .then(async (r) => {
        if (!r.ok) throw Error("Unable to load office sound");
        return audio!.decodeAudioData(await r.arrayBuffer());
      })
      .catch((e) => {
        buffer = undefined;
        throw e;
      });
    await resumed;
    decoded = await buffer;
    if (localStorage.getItem("bitpolito.moo.sound") !== "true") {
      update("off");
      return false;
    }
    if (audio.state !== "running") throw Error("Audio needs a tap");
    play(decoded, undefined, withVibration);
    update("ready");
    return true;
  } catch {
    update("locked");
    return false;
  }
}
function play(value: AudioBuffer, key?: string, vibrate = false) {
  stopOfficeSound();
  const source = audio!.createBufferSource();
  source.buffer = value;
  source.connect(audio!.destination);
  const session = (navigator as Navigator & { audioSession?: AudioSession })
    .audioSession;
  let previous: string | undefined;
  try {
    if (session) {
      previous = session.type;
      session.type = "playback";
    }
  } catch {
    /* Progressive enhancement, not a playback requirement. */
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    source.disconnect?.();
    try {
      if (session && previous !== undefined && session.type === "playback")
        session.type = previous;
    } catch {
      /* A browser may own the audio session. */
    }
    if (active?.source === source) active = undefined;
  };
  const timer = setTimeout(finish, (value.duration || 2) * 1000 + 250);
  source.onended = finish;
  active = { source, key, finish };
  try {
    source.start();
    if (vibrate && vibrationEnabled()) {
      try {
        navigator.vibrate?.([150, 100, 150]);
      } catch {
        /* Optional feedback. */
      }
    }
  } catch (error) {
    finish();
    throw error;
  }
}
// Synchronous after explicit activation, so starting and deduplicating audio can
// commit in the same transaction as the service worker's delivery decision.
export function playOfficeSound(key: string) {
  if (
    state !== "ready" ||
    audio?.state !== "running" ||
    !decoded ||
    localStorage.getItem("bitpolito.moo.sound") !== "true"
  )
    return false;
  try {
    play(decoded, key, true);
    return true;
  } catch {
    update("locked");
    return false;
  }
}
window.addEventListener("storage", (e) => {
  if (e.key === "bitpolito.moo.sound") {
    if (e.newValue !== "true") stopOfficeSound();
    update(
      e.newValue === "true"
        ? audio?.state === "running" && decoded
          ? "ready"
          : "locked"
        : "off",
    );
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") stopOfficeSound();
});
