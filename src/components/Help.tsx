import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, DoorOpen, KeyRound, Lightbulb } from "lucide-react";
import { Button, SettingsRow } from "./ui";

export function ContextTip({
  title,
  children,
  action,
  onAction,
  onDismiss,
}: {
  title: string;
  children: ReactNode;
  action: string;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  function dismiss() {
    const panel = ref.current?.closest(".intercom-panel");
    const target =
      panel?.querySelector<HTMLButtonElement>(
        ".request-card .button:not(:disabled),.request-buttons .button:not(:disabled)",
      ) || document.querySelector<HTMLButtonElement>(".presence-bar .button:not(:disabled)");
    onDismiss();
    target?.focus({ preventScroll: true });
  }
  return (
    <aside ref={ref} className="context-tip" aria-label="Quick tip">
      <div className="tip-heading">
        <Lightbulb size={18} />
        <strong>{title}</strong>
      </div>
      <p>{children}</p>
      <div className="tip-actions">
        <Button variant="ghost" onClick={onAction}>
          {action}
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </aside>
  );
}

// Observe dialogs without moving focus or competing with the office popup.
export function useGuideBlocked() {
  const [blocked, setBlocked] = useState(true);
  useEffect(() => {
    const check = () =>
      setBlocked(
        !!document.querySelector(
          '[role="dialog"],[role="alertdialog"],[role="menu"],form[data-dirty="true"]',
        ),
      );
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-dirty", "role"],
    });
    check();
    return () => observer.disconnect();
  }, []);
  return blocked;
}

const topics = {
  presence: {
    title: "Office presence",
    steps: [
      [
        "Check in when you arrive",
        "Tap I’m in the office. Your teammates can now ask you to get the door; alerts are optional and never block check-in.",
      ],
      [
        "Leave whenever you need",
        "Tap I’m leaving on Office. There is no minimum stay. Presence clears at midnight in Rome if you forget to check out.",
      ],
    ],
    action: "Back to Office",
    destination: "/",
  },
  door: {
    title: "Using the doorbell",
    steps: [
      [
        "Outside? Ring once",
        "Ring the office sends a real request to members marked inside. If nobody is present, you cannot ring. You can leave the request page while waiting, or cancel your request.",
      ],
      [
        "Inside? Lend a hand",
        "Tap I’ll get the door. More than one teammate can respond. Go and open; you don’t need to confirm opening. If you can’t go, release it with I can’t go.",
      ],
      [
        "Confirm when you’re inside",
        "The arriving member taps I’m inside. This ends the request and checks them in automatically. They can leave again immediately.",
      ],
    ],
    action: "Back to Office",
    destination: "/",
  },
  recovery: {
    title: "Keep your identity safe",
    steps: [
      [
        "Save your encrypted backup",
        "Open Identity & recovery to download your backup. Keep both the file and its password: BitPolito cannot reset it. External signers manage their own backups.",
      ],
      [
        "Use another device",
        "Choose Restore identity on the sign-in screen and enter the backup password, or reconnect your signer. Ask an administrator to approve your new phone and remove the old one. Your identity backup does not recover group history.",
      ],
      [
        "Moving to the shared app",
        "Your encrypted identity stays on this device. Keep the backup and password separately. The team uses Nostr relays; no BitPolito application server is needed.",
      ],
    ],
    action: "Open Identity & recovery",
    destination: "/account?view=identity",
  },
} as const;

export function isHelpTopic(topic: string | null): topic is keyof typeof topics {
  return Object.hasOwn(topics, topic || "");
}

export function Help({ topic, go }: { topic: string | null; go: (to: string) => void }) {
  const guide = isHelpTopic(topic) ? topics[topic] : undefined;
  const content = useRef<HTMLDivElement>(null);
  const previousTopic = useRef(topic);
  useEffect(() => {
    if (previousTopic.current !== topic) {
      previousTopic.current = topic;
      content.current?.focus({ preventScroll: true });
    }
  }, [topic]);
  if (guide)
    return (
      <div
        ref={content}
        className="help-content"
        tabIndex={-1}
        role="region"
        aria-label={guide.title}
      >
        <h3>{guide.title}</h3>
        <ol className="help-steps">
          {guide.steps.map(([title, description]) => (
            <li key={title}>
              <h4>{title}</h4>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <Button onClick={() => go(guide.destination)}>{guide.action}</Button>
      </div>
    );
  return (
    <div
      ref={content}
      className="help-content"
      tabIndex={-1}
      role="region"
      aria-label="Help topics"
    >
      <p className="small muted">
        A little help, whenever you need it. Guides never send a door request for you.
      </p>
      <div className="settings-list">
        <SettingsRow
          icon={<DoorOpen size={20} />}
          label="Office presence"
          detail="Check in, help out and leave"
          onClick={() => go("/account?view=help&topic=presence")}
        />
        <SettingsRow
          icon={<Bell size={20} />}
          label="Using the doorbell"
          detail="Ring, respond and confirm entry"
          onClick={() => go("/account?view=help&topic=door")}
        />
        <SettingsRow
          icon={<Bell size={20} />}
          label="Set up office alerts"
          detail="Enable alerts → Test"
          onClick={() => go("/account?view=alerts")}
        />
        <SettingsRow
          icon={<KeyRound size={20} />}
          label="Backup & recovery guide"
          detail="Keep your identity safe"
          onClick={() => go("/account?view=help&topic=recovery")}
        />
      </div>
      <p className="small muted">
        The doorbell needs an internet connection. Phone settings control notification sound, silent
        mode and Focus.
      </p>
    </div>
  );
}
