import { useEffect, useRef, useState, type ReactNode } from "react";
import { KeyRound, Lightbulb } from "lucide-react";
import { getModuleHelpLinks, getModuleHelpTopics } from "../modules/registry";
import type { ModuleHelpTopic } from "../modules/types";
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

const coreTopics: ModuleHelpTopic[] = [
  {
    id: "recovery",
    title: "Keep your identity safe",
    label: "Backup & recovery guide",
    detail: "Keep your identity safe",
    icon: <KeyRound size={20} />,
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
];

function allTopics(): ModuleHelpTopic[] {
  return [...getModuleHelpTopics(), ...coreTopics];
}

export function isHelpTopic(topic: string | null): boolean {
  if (!topic) return false;
  return allTopics().some((t) => t.id === topic);
}

export function Help({ topic, go }: { topic: string | null; go: (to: string) => void }) {
  const topics = allTopics();
  const links = getModuleHelpLinks();
  const guide = topic ? topics.find((t) => t.id === topic) : undefined;
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
        Short guides for BitPolito Hub and its tools, whenever you need them.
      </p>
      <div className="settings-list">
        {getModuleHelpTopics().map((item) => (
          <SettingsRow
            key={item.id}
            icon={item.icon}
            label={item.label}
            detail={item.detail}
            onClick={() => go(`/account?view=help&topic=${item.id}`)}
          />
        ))}
        {links.map((item) => (
          <SettingsRow
            key={item.id}
            icon={item.icon}
            label={item.label}
            detail={item.detail}
            onClick={() => go(item.to)}
          />
        ))}
        {coreTopics.map((item) => (
          <SettingsRow
            key={item.id}
            icon={item.icon}
            label={item.label}
            detail={item.detail}
            onClick={() => go(`/account?view=help&topic=${item.id}`)}
          />
        ))}
      </div>
      <p className="small muted">
        Live features need an internet connection. Phone settings control notification sound, silent
        mode and Focus.
      </p>
    </div>
  );
}
