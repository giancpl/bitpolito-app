import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { sandboxKey, sandboxProfiles, sandboxOrigin } from "../shared/sandbox";

const config = document.getElementById("bitpolito-sandbox");
if (import.meta.env.DEV && config && location.hostname === "127.0.0.1") {
  const { profile: id } = JSON.parse(config.textContent || "{}");
  const profile = sandboxProfiles.find((profile) => profile.id === id);
  if (!profile || sandboxOrigin(profile) !== location.origin)
    throw Error("Invalid sandbox address.");
  const panel = document.createElement("aside");
  panel.className = "sandbox-panel";
  panel.setAttribute("aria-label", "Local testing controls");
  const label = document.createElement("strong");
  label.textContent = `Local sandbox · ${profile.name}`;
  const description = document.createElement("span");
  description.textContent =
    "Test identities · Separate data · Alerts in app only";
  const links = document.createElement("nav");
  links.setAttribute("aria-label", "Test profiles");
  for (const actor of sandboxProfiles) {
    const link = document.createElement("a");
    link.href = sandboxOrigin(actor);
    link.textContent = `${actor.name} · ${actor.role === "follower" ? "New member" : actor.role === "admin" ? "Admin" : "Member"}`;
    if (actor.id === profile.id) link.setAttribute("aria-current", "page");
    else {
      link.target = "_blank";
      link.rel = "noopener";
    }
    links.append(link);
  }
  const enter = document.createElement("button");
  enter.type = "button";
  enter.textContent = `Use ${profile.name} test identity`;
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  panel.append(label, description, links, enter, status);
  const style = document.createElement("style");
  style.textContent = `
    .sandbox-panel {position:sticky;top:0;z-index:40;display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;padding:12px 20px;background:#202632;color:white;font:14px/1.5 system-ui;}
    .sandbox-panel nav {display:flex;flex-wrap:wrap;gap:8px;}
    .sandbox-panel a,.sandbox-panel button {display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 12px;border:1px solid #798499;border-radius:8px;color:white;background:transparent;font:inherit;text-decoration:none;cursor:pointer;}
    .sandbox-panel a[aria-current],.sandbox-panel button {background:#fff;color:#202632;}
    .sandbox-panel :focus-visible {outline:3px solid #b5c4ff;outline-offset:2px;}
    .sandbox-panel button:disabled {opacity:.65;cursor:wait;}
    .sandbox-panel [role=status]:empty {display:none;}
    .sidebar {top:var(--sandbox-height,0px)!important;}
    #root :focus {scroll-margin-top:calc(var(--sandbox-height,0px) + 96px);}
    @media(max-width:767px){.sandbox-panel {padding:8px 12px;gap:8px;}.sandbox-panel > span:nth-child(2){display:none;}}
  `;
  document.head.append(style);
  document.body.prepend(panel);
  new ResizeObserver(() =>
    document.documentElement.style.setProperty(
      "--sandbox-height",
      `${panel.offsetHeight}px`,
    ),
  ).observe(panel);
  enter.onclick = async () => {
    enter.disabled = true;
    status.textContent = "Connecting test identity…";
    const key = sandboxKey(profile.key);
    try {
      const challengeResponse = await fetch("/api/auth/challenge");
      if (!challengeResponse.ok) throw Error("Could not start test sign-in.");
      const { challenge } = await challengeResponse.json();
      const body = JSON.stringify({ challenge });
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const event = finalizeEvent(
        {
          kind: 27235,
          content: "",
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", `${location.origin}/api/auth/session`],
            ["method", "POST"],
            ["payload", digest],
          ],
        },
        key,
      );
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bitpolito-Request": "1",
          Authorization: `Nostr ${btoa(JSON.stringify(event))}`,
        },
        body,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Test sign-in failed.");
      if (result.user.id !== getPublicKey(key))
        throw Error("Unexpected test identity.");
      location.reload();
    } catch (error) {
      status.textContent = (error as Error).message;
      enter.disabled = false;
    } finally {
      key.fill(0);
    }
  };
}
