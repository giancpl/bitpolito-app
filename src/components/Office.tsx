import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Bell, Check, ChevronRight, DoorOpen, LogOut } from "lucide-react";
import { team, type RequestAction } from "../lib/hub";
import { useIdentity } from "../lib/identity";
import { keys, useOffice, useResources } from "../lib/queries";
import { useGuidance } from "../lib/guidance";
import { ContextTip } from "./Help";
import { useToast } from "./Feedback";
import {
  Avatar,
  AvatarGroup,
  Button,
  ErrorState,
  Loading,
  Notice,
  StatusBadge,
  TransitionView,
} from "./ui";
import { isLive, people, requestTitle, responders } from "../lib/office";
import type { MooRequest, MooState } from "../../shared/contracts";

const RING_KEY = "bitpolito.ring.operation";
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
});

/** Shown on secondary pages so a live door request is never more than one tap away. */
export function RequestBanner() {
  const { user } = useIdentity(),
    { data } = useOffice();
  const active = data?.own && isLive(data.own) ? data.own : data?.incoming.find(isLive);
  if (!user || !active) return null;
  return (
    <Link className="moo-banner" to={`/moo?request=${active.id}`}>
      <Bell size={20} />
      <span>
        <strong>{requestTitle(active, user.id)}</strong>
        <small>View request</small>
      </span>
      <ChevronRight size={18} />
    </Link>
  );
}

function Countdown({ request, data }: { request: MooRequest; data: MooState }) {
  // serverTime anchors the clock so a skewed phone clock cannot mislead the countdown.
  const offset = useMemo(() => data.serverTime - Date.now() / 1000, [data.serverTime]);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.round(request.expiresAt - (Date.now() / 1000 + offset)));
  if (!isLive(request) || !left) return null;
  const minutes = Math.floor(left / 60),
    seconds = String(left % 60).padStart(2, "0");
  return (
    <span
      className="request-countdown"
      aria-label={`Expires in ${minutes} minutes ${seconds} seconds`}
    >
      {minutes}:{seconds}
    </span>
  );
}

export function OfficePage() {
  const { user } = useIdentity(),
    query = useOffice(),
    client = useQueryClient();
  const navigate = useNavigate(),
    location = useLocation(),
    [params] = useSearchParams();
  const home = location.pathname === "/",
    requestPage = location.pathname === "/moo";
  const guidance = useGuidance(user?.id),
    toast = useToast();
  const operation = useRef(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const resources = useResources(home);
  const latest = query.data?.own;
  useEffect(() => {
    if (latest && !isLive(latest)) sessionStorage.removeItem(RING_KEY);
  }, [latest?.id, latest?.status]);
  if (!user) return null;
  if (!query.data)
    return query.error ? (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    ) : (
      <Loading />
    );

  const data = query.data,
    inside = data.presence.some((p) => p.id === user.id),
    own = data.own;
  const active = !!own && isLive(own),
    disabled = !!busy || !!query.error;
  const others = data.presence.filter((p) => p.id !== user.id);

  async function run(key: string, fn: () => Promise<unknown>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(key);
    setError("");
    try {
      await fn();
      await client.invalidateQueries({ queryKey: keys.office });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      operation.current = false;
      setBusy("");
    }
  }
  const respond = (r: MooRequest, action: RequestAction) =>
    void run(r.id, async () => {
      await team.respond(r.id, action);
      if (action === "inside") {
        guidance.complete("inside");
        guidance.complete("check-in");
        toast("You’re in. You’re now available to get the door.");
      }
      if (action === "claim") {
        guidance.complete("claim");
        toast(`${r.requesterName || "They"} will see that you’re coming.`);
      }
    });
  const ring = (fresh = false) =>
    void run("ring", async () => {
      // A stable key makes a retried ring idempotent after a flaky connection.
      if (fresh) sessionStorage.removeItem(RING_KEY);
      let key = sessionStorage.getItem(RING_KEY);
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(RING_KEY, key);
      }
      const result = await team.ring(key);
      guidance.complete("ring");
      navigate(`/moo?request=${result.id}`);
    });
  const checkIn = () =>
    void run("presence", async () => {
      await team.checkIn();
      guidance.complete("check-in");
      toast("You’re in. Presence clears at midnight.");
    });
  const leave = () =>
    void run("presence", async () => {
      await team.leave();
      toast("You’re marked as outside. Office alerts have stopped.");
    });

  function card(r: MooRequest) {
    const mine = r.requesterId === user!.id,
      live = isLive(r);
    const coming = responders(r),
      going = coming.some((p) => p.id === user!.id);
    return (
      <article
        className={`request-card ${live ? (mine ? "is-own" : "is-incoming") : "is-ended"}`}
        id={`request-${r.id}`}
        key={r.id}
        tabIndex={-1}
      >
        <div className="request-person">
          <Avatar name={mine ? user!.name : r.requesterName} />
          <span>
            <strong>{mine ? "Your door request" : r.requesterName}</strong>
            <small>Rang at {clock.format(r.createdAt * 1000)}</small>
          </span>
          <Countdown request={r} data={data} />
        </div>
        <TransitionView id={`${r.id}-${r.status}-${coming.length}-${inside}`}>
          <h2 className="request-title" aria-live="polite">
            {requestTitle(r, user!.id, inside)}
          </h2>
        </TransitionView>
        {mine ? (
          <>
            <p className="small muted">
              {r.status === "waiting"
                ? `${people(data.presence.length)} in the office ${data.presence.length === 1 ? "has" : "have"} been notified.`
                : r.status === "claimed"
                  ? "Confirm once you’ve stepped inside."
                  : r.status === "resolved"
                    ? inside
                      ? "You’re checked in and available to get the door."
                      : "You’re outside now. Your previous entry remains confirmed."
                    : data.presence.length
                      ? "Someone is still in the office. You can ring again."
                      : "Nobody is in the office right now."}
            </p>
            {live ? (
              <div className="request-buttons">
                <Button
                  disabled={disabled}
                  busy={busy === r.id}
                  onClick={() => respond(r, "inside")}
                >
                  <Check size={18} />
                  I’m inside
                </Button>
                <Button variant="ghost" disabled={disabled} onClick={() => respond(r, "cancel")}>
                  Cancel request
                </Button>
              </div>
            ) : (
              !inside && (
                <Button
                  disabled={disabled || !data.presence.length}
                  busy={busy === "ring"}
                  onClick={() => ring(true)}
                >
                  Ring again
                </Button>
              )
            )}
          </>
        ) : going ? (
          <>
            <p className="small muted">Go and open. They’ll confirm when they’re inside.</p>
            <Button variant="secondary" disabled={disabled} onClick={() => respond(r, "release")}>
              I can’t go
            </Button>
          </>
        ) : live ? (
          <>
            {coming.length > 0 && <p className="small muted">You can go too if you’re closer.</p>}
            <Button disabled={disabled} busy={busy === r.id} onClick={() => respond(r, "claim")}>
              <DoorOpen size={18} />
              I’ll get the door
            </Button>
          </>
        ) : null}
      </article>
    );
  }

  const requests = [...(own && (requestPage || active) ? [own] : []), ...data.incoming];
  const target = params.get("request");
  const sorted = [...requests].sort((a, b) =>
    a.id === target
      ? -1
      : b.id === target
        ? 1
        : Number(isLive(b)) - Number(isLive(a)) || a.createdAt - b.createdAt,
  );

  const summary = (
    <section className="office-summary" aria-label="Your office status">
      <div className="section-heading">
        <h2>At the office</h2>
        <span className="pill">Torino</span>
      </div>
      <div className="presence-bar">
        <StatusBadge inside={inside} />
        {inside ? (
          <Button variant="secondary" disabled={!!busy} busy={busy === "presence"} onClick={leave}>
            <LogOut size={16} />
            I’m leaving
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={disabled || active}
            busy={busy === "presence"}
            onClick={checkIn}
          >
            <DoorOpen size={16} />
            I’m in the office
          </Button>
        )}
      </div>
      <Link className="people-summary" to="/office" aria-label="See who’s in the office">
        <AvatarGroup people={data.presence} />
        <span>
          {data.presence.length
            ? inside && !others.length
              ? "Only you are in the office"
              : `${people(data.presence.length)} in the office`
            : "Nobody is in the office"}
        </span>
        <ChevronRight size={18} />
      </Link>
      {!inside && !active && (
        <Button
          className="compact-bell"
          disabled={disabled || !data.presence.length}
          busy={busy === "ring"}
          onClick={() => ring()}
        >
          <img src="/brand/icon-bell.svg" alt="" />
          {data.presence.length ? "Ring the office" : "Nobody to ring yet"}
        </Button>
      )}
      <div className="office-meta">
        <span>Presence clears at midnight · Rome</span>
        <Link to="/account?view=alerts">
          Office alerts
          <ChevronRight size={14} />
        </Link>
      </div>
    </section>
  );

  return (
    <div className={`office-page ${home ? "team-home" : "office-detail"}`}>
      {!home && (
        <Button variant="ghost" className="panel-back" onClick={() => navigate("/")}>
          <ArrowLeft size={18} />
          Home
        </Button>
      )}
      <div className="home-heading">
        <div>
          <p className="eyebrow">{home ? "Your team, together" : "BitPolito office"}</p>
          <h1 tabIndex={-1}>
            {home ? `Hi, ${user.name || "teammate"}.` : requestPage ? "Door request" : "Office"}
          </h1>
        </div>
        {home && <img src="/brand/cow-icon-blue.svg" alt="" />}
      </div>
      {query.error && (
        <Notice>
          Office status may be out of date.
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {sorted.length > 0 && (
        <section className="request-list" aria-label="Door requests">
          {sorted.map(card)}
        </section>
      )}
      {requestPage && !requests.length && (
        <Notice tone="info">
          No active door request. Ring from Home when someone is in the office.
        </Notice>
      )}
      {summary}
      {!home && !requestPage && (
        <section className="office-people">
          <h2>In the office</h2>
          {data.presence.length ? (
            <ul className="presence-list">
              {data.presence.map((p) => (
                <li key={p.id}>
                  <Avatar name={p.name} />
                  <span>
                    <strong>
                      {p.name}
                      {p.id === user.id ? " (you)" : ""}
                    </strong>
                    <small>Available to get the door</small>
                  </span>
                  <Check size={18} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nobody is in the office right now.</p>
          )}
        </section>
      )}
      {home && (
        <section className="home-tools">
          <div className="section-heading">
            <h2>Your tools</h2>
            <Link to="/resources" className="text-button">
              View all
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="quick-tool-grid">
            <Link className="quick-tool" to="/office">
              <img src="/brand/icon-bell.svg" alt="" />
              <strong>Office</strong>
              <span>Presence & doorbell</span>
            </Link>
            {resources.data
              ?.filter((r) => r.status === "active")
              .slice(0, 3)
              .map((r) => (
                <a className="quick-tool" key={r.id} href={r.url} target="_blank" rel="noreferrer">
                  <img src={`/brand/${r.icon}`} alt="" />
                  <strong>{r.title}</strong>
                  <span>{r.category}</span>
                </a>
              ))}
          </div>
          {resources.isError && (
            <Button variant="ghost" onClick={() => void resources.refetch()}>
              Retry tools
            </Button>
          )}
        </section>
      )}
      {home &&
        !error &&
        !query.error &&
        !busy &&
        !requests.length &&
        (inside && !guidance.dismissed("alerts") ? (
          <ContextTip
            title="Office alerts, your way"
            action="Set up office alerts"
            onAction={() => {
              guidance.dismiss("alerts");
              navigate("/account?view=alerts");
            }}
            onDismiss={() => guidance.dismiss("alerts")}
          >
            Get your phone ready for door alerts. Checking in already makes you available.
          </ContextTip>
        ) : !inside && !guidance.completed("check-in") && !guidance.dismissed("presence") ? (
          <ContextTip
            title="At the office? Let the team know"
            action="How presence works"
            onAction={() => {
              guidance.dismiss("presence");
              navigate("/account?view=help&topic=presence");
            }}
            onDismiss={() => guidance.dismiss("presence")}
          >
            Check in to be available to get the door. Leave whenever you need.
          </ContextTip>
        ) : null)}
    </div>
  );
}
