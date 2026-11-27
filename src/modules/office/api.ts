import { hub } from "../../lib/hub";
import type { MooRequest, MooState } from "../../../shared/contracts";

export type RequestAction = "claim" | "release" | "inside" | "cancel";

/** Typed runtime commands owned by the Office module. */
export const officeApi = {
  state: () => hub.command<MooState>("moo"),
  checkIn: () => hub.command<void>("presence", { action: "arrive" }),
  leave: () => hub.command<void>("presence", { action: "leave" }),
  ring: (key: string) => hub.command<MooRequest>("ring", { key }),
  respond: (id: string, action: RequestAction) =>
    hub.command<MooRequest>("request", { id, action }),
  alertSettings: (settings: { vibration: boolean }) => hub.command<void>("alertSettings", settings),
};
