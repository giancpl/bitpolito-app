import { useSyncExternalStore } from "react";

export type Guide = "presence" | "alerts" | "door";
export type GuideAction = "check-in" | "ring" | "claim" | "inside";
type Progress = { dismissed: Guide[]; completed: GuideAction[] };
const empty = '{"dismissed":[],"completed":[]}';
const memory = new Map<string, string>();
const changed = "bitpolito:guidance";
const keyFor = (member: string) => `bitpolito.guidance.v1.${member}`;
function read(member: string) {
  const key = keyFor(member);
  try {
    return memory.get(key) || localStorage.getItem(key) || empty;
  } catch {
    return memory.get(key) || empty;
  }
}
function parse(raw: string): Progress {
  try {
    const value = JSON.parse(raw);
    return {
      dismissed: Array.isArray(value?.dismissed) ? value.dismissed : [],
      completed: Array.isArray(value?.completed) ? value.completed : [],
    };
  } catch {
    return JSON.parse(empty);
  }
}
function write(member: string, update: (value: Progress) => Progress) {
  const value = JSON.stringify(update(parse(read(member))));
  try {
    localStorage.setItem(keyFor(member), value);
    memory.delete(keyFor(member));
  } catch {
    // Guidance must never prevent an office action when storage is unavailable.
    memory.set(keyFor(member), value);
  }
  window.dispatchEvent(new Event(changed));
}
const subscribe = (notify: () => void) => {
  window.addEventListener(changed, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(changed, notify);
    window.removeEventListener("storage", notify);
  };
};
export function useGuidance(member = "") {
  const raw = useSyncExternalStore(subscribe, () => read(member));
  const progress = parse(raw);
  // Preserve dismissals from the previous office-alert suggestion.
  let legacyAlerts = false;
  try {
    legacyAlerts = !!localStorage.getItem(`bitpolito.office.alerts-setup-v2.${member}`);
  } catch {
    /* Optional local preference. */
  }
  return {
    dismissed: (guide: Guide) =>
      progress.dismissed.includes(guide) || (guide === "alerts" && legacyAlerts),
    completed: (action: GuideAction) => progress.completed.includes(action),
    dismiss: (guide: Guide) =>
      write(member, (p) => ({
        ...p,
        dismissed: [...new Set([...p.dismissed, guide])],
      })),
    complete: (action: GuideAction) =>
      write(member, (p) => ({
        ...p,
        completed: [...new Set([...p.completed, action])],
      })),
  };
}
