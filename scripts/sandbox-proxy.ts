import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProxyOptions } from "vite";

// Cookie names are isolated per persona because browsers share cookies across
// ports. Only the matching sandbox cookie is forwarded to the normal API.
export function sandboxProxy(target: string, id: string): ProxyOptions {
  const prefix = `bp_sandbox_${id}_`;
  return {
    target,
    configure(proxy) {
      proxy.on("proxyReq", (outgoing, request) => {
        const cookies = (request.headers.cookie || "")
          .split(";")
          .map((cookie) => cookie.trim());
        const forwarded = cookies
          .filter(
            (cookie) =>
              cookie.startsWith(prefix + "session=") ||
              cookie.startsWith(prefix + "challenge="),
          )
          .map((cookie) => "bp_" + cookie.slice(prefix.length));
        outgoing.removeHeader("cookie");
        if (forwarded.length)
          outgoing.setHeader("cookie", forwarded.join("; "));
      });
      proxy.on("proxyRes", (response) => {
        if (response.headers["set-cookie"])
          response.headers["set-cookie"] = response.headers["set-cookie"].map(
            (cookie) =>
              cookie.replace(/^bp_(session|challenge)=/, `${prefix}$1=`),
          );
      });
    },
  };
}
export function sandboxBoundary(origin: string) {
  const expected = new URL(origin).host;
  return (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (
      request.headers.host !== expected ||
      (request.headers.origin && request.headers.origin !== origin)
    ) {
      response.writeHead(403, { "Content-Type": "text/plain" });
      response.end(
        "This sandbox accepts requests only from its own local address.",
      );
      return;
    }
    next();
  };
}
