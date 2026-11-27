import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, ChevronRight, DoorOpen, LogOut } from "lucide-react";
import { useIdentity } from "../../lib/identity";
import { Avatar, AvatarGroup, Button, StatusBadge, TransitionView } from "../../components/ui";
import { useOffice } from "./queries";
import { isLive, people, requestTitle, responders } from "./logic";
import type { RequestAction } from "./api";
import type { MooRequest, MooState, User } from "../../../shared/contracts";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
});

const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Shown on secondary pages so a live door request is never more than one tap away. */
export function RequestBanner() {
  const { user } = useIdentity();
  const { data } = useOffice();
  const active = data?.own && isLive(data.own) ? data.own : data?.incoming.find(isLive);

  return (
    <AnimatePresence initial={false}>
      {user && active && (
        <motion.div
          key={active.id}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.2, ease: easeOut }}
        >
          <Link className="moo-banner" to={`/moo?request=${active.id}`}>
            <span className="banner-bell" aria-hidden="true">
              <Bell size={18} />
            </span>
            <span>
              <strong>{requestTitle(active, user.id)}</strong>
              <small>View request</small>
            </span>
            <ChevronRight size={18} />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
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
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  return (
    <span
      className="request-countdown"
      aria-label={`Expires in ${minutes} minutes ${seconds} seconds`}
    >
      {minutes}:{seconds}
    </span>
  );
}

export function RequestCard({
  request,
  data,
  user,
  inside,
  busy,
  disabled,
  onRespond,
  onRingAgain,
}: {
  request: MooRequest;
  data: MooState;
  user: User;
  inside: boolean;
  busy: string;
  disabled: boolean;
  onRespond: (request: MooRequest, action: RequestAction) => void;
  onRingAgain: () => void;
}) {
  const mine = request.requesterId === user.id;
  const live = isLive(request);
  const coming = responders(request);
  const going = coming.some((p) => p.id === user.id);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      transition={{ duration: 0.22, ease: easeOut }}
      className={`request-card ${live ? (mine ? "is-own" : "is-incoming") : "is-ended"}`}
      id={`request-${request.id}`}
      tabIndex={-1}
    >
      <div className="request-person">
        <Avatar name={mine ? user.name : request.requesterName} />
        <span>
          <strong>{mine ? "Your door request" : request.requesterName}</strong>
          <small>Rang at {clock.format(request.createdAt * 1000)}</small>
        </span>
        <Countdown request={request} data={data} />
      </div>
      <TransitionView id={`${request.id}-${request.status}-${coming.length}-${inside}`}>
        <h2 className="request-title" aria-live="polite">
          {requestTitle(request, user.id, inside)}
        </h2>
      </TransitionView>
      {mine ? (
        <>
          <p className="small muted">
            {request.status === "waiting"
              ? `${people(data.presence.length)} in the office ${data.presence.length === 1 ? "has" : "have"} been notified.`
              : request.status === "claimed"
                ? "Confirm once you’ve stepped inside."
                : request.status === "resolved"
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
                busy={busy === request.id}
                onClick={() => onRespond(request, "inside")}
              >
                <Check size={18} />
                I’m inside
              </Button>
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => onRespond(request, "cancel")}
              >
                Cancel request
              </Button>
            </div>
          ) : (
            !inside && (
              <Button
                disabled={disabled || !data.presence.length}
                busy={busy === "ring"}
                onClick={onRingAgain}
              >
                Ring again
              </Button>
            )
          )}
        </>
      ) : going ? (
        <>
          <p className="small muted">Go and open. They’ll confirm when they’re inside.</p>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onRespond(request, "release")}
          >
            I can’t go
          </Button>
        </>
      ) : live ? (
        <>
          {coming.length > 0 && <p className="small muted">You can go too if you’re closer.</p>}
          <Button
            disabled={disabled}
            busy={busy === request.id}
            onClick={() => onRespond(request, "claim")}
          >
            <DoorOpen size={18} />
            I’ll get the door
          </Button>
        </>
      ) : null}
    </motion.article>
  );
}

export function OfficeStatusCard({
  data,
  inside,
  active,
  busy,
  disabled,
  othersCount,
  onCheckIn,
  onLeave,
  onRing,
}: {
  data: MooState;
  inside: boolean;
  active: boolean;
  busy: string;
  disabled: boolean;
  othersCount: number;
  onCheckIn: () => void;
  onLeave: () => void;
  onRing: () => void;
}) {
  return (
    <section className="office-summary" aria-label="Your office status">
      <div className="section-heading">
        <h2>At the office</h2>
        <span className="pill">Torino</span>
      </div>
      <div className={`presence-bar ${inside ? "is-inside" : "is-outside"}`}>
        <StatusBadge inside={inside} />
        {inside ? (
          <Button
            variant="secondary"
            disabled={!!busy}
            busy={busy === "presence"}
            onClick={onLeave}
          >
            <LogOut size={16} />
            I’m leaving
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={disabled || active}
            busy={busy === "presence"}
            onClick={onCheckIn}
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
            ? inside && !othersCount
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
          onClick={onRing}
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
}
