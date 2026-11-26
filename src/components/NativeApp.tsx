import { lazy, Suspense, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { inviteToken, isPreview } from "../lib/hub";
import { isAndroid, Native, nativeEventData } from "../lib/native";

const REQUEST_ID = /^[\w-]{1,80}$/;

/** Bridges Android shell events (back, resume, notifications, deep links) into the router. */
export function NativeLifecycle() {
  const navigate = useNavigate(),
    location = useLocation(),
    client = useQueryClient();

  // The browser simulator signals changes from other tabs with the same event name.
  useEffect(() => {
    if (isAndroid || !isPreview) return;
    const update = () => void client.invalidateQueries();
    window.addEventListener("bitpolito:realtime", update);
    return () => window.removeEventListener("bitpolito:realtime", update);
  }, [client]);

  useEffect(() => {
    if (!isAndroid) return;
    const back = () => {
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
        return;
      }
      if (location.pathname === "/") void Native.background();
      else if ((history.state?.idx || 0) > 0) navigate(-1);
      else navigate("/");
    };
    const refresh = () => void client.invalidateQueries();
    const openRequest = (event: Event) => {
      const id = nativeEventData<{ request?: string }>(event)?.request;
      if (typeof id === "string" && REQUEST_ID.test(id)) navigate(`/moo?request=${id}`);
    };
    const consumeLaunch = () =>
      void Native.consumeRequest().then(({ request, invite }) => {
        if (invite) {
          const token = inviteToken(invite);
          sessionStorage.setItem("bitpolito.invite", token);
          window.dispatchEvent(new CustomEvent("bitpolito:invite", { detail: { token } }));
          navigate("/");
        }
        if (request && REQUEST_ID.test(request)) navigate(`/moo?request=${request}`);
      });
    // External links open in the system browser instead of replacing the app WebView.
    const links = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (
        link &&
        /^https?:/.test(link.href) &&
        new URL(link.href).origin !== window.location.origin
      ) {
        event.preventDefault();
        void Native.openExternal({ url: link.href });
      }
    };
    consumeLaunch();
    window.addEventListener("bitpolito:realtime", refresh);
    window.addEventListener("bitpolito:resume", refresh);
    window.addEventListener("bitpolito:resume", consumeLaunch);
    window.addEventListener("bitpolito:back", back);
    window.addEventListener("bitpolito:request", openRequest);
    document.addEventListener("click", links);
    return () => {
      window.removeEventListener("bitpolito:realtime", refresh);
      window.removeEventListener("bitpolito:resume", refresh);
      window.removeEventListener("bitpolito:resume", consumeLaunch);
      window.removeEventListener("bitpolito:back", back);
      window.removeEventListener("bitpolito:request", openRequest);
      document.removeEventListener("click", links);
    };
  }, [navigate, location.pathname, client]);
  return null;
}

// The team bundle excludes the sandbox module and its disposable keys entirely.
const Sandbox =
  // Inline env checks let Vite drop the sandbox module from the team build.
  import.meta.env.VITE_ANDROID_SANDBOX === "true" || import.meta.env.VITE_HUB_PREVIEW === "true"
    ? lazy(() => import("./AndroidSandbox"))
    : () => null;
export function AndroidSandbox() {
  return (
    <Suspense fallback={null}>
      <Sandbox />
    </Suspense>
  );
}
