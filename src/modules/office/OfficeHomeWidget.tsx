import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ContextTip } from "../../components/Help";
import { Button, ErrorState, Loading, Notice } from "../../components/ui";
import { isLive } from "./logic";
import { OfficeStatusCard, RequestCard } from "./OfficeCards";
import { useOfficeActions } from "./useOfficeActions";

const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Live Office widget rendered on the Home dashboard. */
export function OfficeHomeWidget() {
  const navigate = useNavigate();
  const {
    user,
    query,
    data,
    busy,
    error,
    guidance,
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

  const requests = [...(own && active ? [own] : []), ...data.incoming];
  const sorted = [...requests].sort(
    (a, b) => Number(isLive(b)) - Number(isLive(a)) || a.createdAt - b.createdAt,
  );

  const tipKey =
    !error && !query.error && !busy && !requests.length
      ? inside && !guidance.dismissed("alerts")
        ? "alerts"
        : !inside && !guidance.completed("check-in") && !guidance.dismissed("presence")
          ? "presence"
          : null
      : null;

  return (
    <div className="module-widget office-widget">
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
      <AnimatePresence initial={false}>
        {tipKey === "alerts" && (
          <motion.div
            key="tip-alerts"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: easeOut }}
          >
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
          </motion.div>
        )}
        {tipKey === "presence" && (
          <motion.div
            key="tip-presence"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: easeOut }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
