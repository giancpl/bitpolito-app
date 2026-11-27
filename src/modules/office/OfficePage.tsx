import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check } from "lucide-react";
import { Avatar, Button, ErrorState, Loading, Notice } from "../../components/ui";
import { isLive } from "./logic";
import { OfficeStatusCard, RequestCard } from "./OfficeCards";
import { useOfficeActions } from "./useOfficeActions";

const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function OfficePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const requestPage = location.pathname === "/moo";
  const {
    user,
    query,
    data,
    busy,
    error,
    inside,
    own,
    active,
    disabled,
    others,
    respond,
    ring,
    checkIn,
    leave,
  } = useOfficeActions();

  if (!user) return null;
  if (!data) {
    return query.error ? (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    ) : (
      <Loading />
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

  return (
    <div className="office-page office-detail">
      <Button variant="ghost" className="panel-back" onClick={() => navigate("/")}>
        <ArrowLeft size={18} />
        Home
      </Button>
      <div className="home-heading">
        <div>
          <p className="eyebrow">BitPolito office</p>
          <h1 tabIndex={-1}>{requestPage ? "Door request" : "Office"}</h1>
        </div>
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
          <AnimatePresence initial={false}>
            {sorted.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                data={data}
                user={user}
                inside={inside}
                busy={busy}
                disabled={disabled}
                onRespond={respond}
                onRingAgain={() => ring(true)}
              />
            ))}
          </AnimatePresence>
        </section>
      )}
      {requestPage && !requests.length && (
        <Notice tone="info">
          No active door request. Ring from Home when someone is in the office.
        </Notice>
      )}
      <OfficeStatusCard
        data={data}
        inside={inside}
        active={active}
        busy={busy}
        disabled={disabled}
        othersCount={others.length}
        onCheckIn={checkIn}
        onLeave={leave}
        onRing={() => ring()}
      />
      {!requestPage && (
        <section className="office-people">
          <h2>In the office</h2>
          {data.presence.length ? (
            <ul className="presence-list">
              <AnimatePresence initial={false}>
                {data.presence.map((p) => (
                  <motion.li
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: easeOut }}
                  >
                    <Avatar name={p.name} />
                    <span>
                      <strong>
                        {p.name}
                        {p.id === user.id ? " (you)" : ""}
                      </strong>
                      <small>Available to get the door</small>
                    </span>
                    <Check size={18} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="muted">Nobody is in the office right now.</p>
          )}
        </section>
      )}
    </div>
  );
}
