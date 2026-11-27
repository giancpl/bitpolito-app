import { describe, expect, it } from "vitest";
import {
  allModuleRoutes,
  findModuleTitle,
  getModuleHelpLinks,
  getModuleHelpTopics,
  getProfileSettings,
  isAnyModuleRoute,
  modules,
} from "../src/modules/registry";

describe("module registry", () => {
  it("registers unique module identifiers and routes", () => {
    const ids = modules.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);

    const paths = allModuleRoutes().map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("exposes Office routes, settings, and help topics through the platform contract", () => {
    expect(isAnyModuleRoute("/office")).toBe(true);
    expect(isAnyModuleRoute("/moo")).toBe(true);
    expect(isAnyModuleRoute("/resources")).toBe(false);
    expect(findModuleTitle("/office")).toBe("Office");
    expect(findModuleTitle("/moo")).toBe("Office");

    expect(getProfileSettings().some((s) => s.view === "alerts")).toBe(true);
    expect(getModuleHelpTopics().map((t) => t.id)).toEqual(
      expect.arrayContaining(["presence", "door"]),
    );
    expect(getModuleHelpLinks().some((l) => l.to === "/account?view=alerts")).toBe(true);
  });
});
