import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { npubEncode } from "nostr-tools/nip19";
import {
  ArrowLeft,
  CircleHelp,
  Copy,
  Download,
  KeyRound,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { team } from "../lib/hub";
import { backupName, downloadText } from "../lib/download";
import { useIdentity } from "../lib/identity";
import { forgetVault, saveVault, vaultCall } from "../lib/vault";
import { getProfileSettings } from "../modules/registry";
import {
  AsyncForm,
  Avatar,
  Button,
  Field,
  FieldError,
  Notice,
  SettingsRow,
  TransitionView,
} from "./ui";
import { useConfirm, useToast } from "./Feedback";
import { Help, isHelpTopic } from "./Help";

const coreTitles: Record<string, string> = {
  profile: "Profile",
  edit: "Edit profile",
  identity: "Identity & recovery",
  password: "Change encryption password",
  help: "Help",
};

export function AccountPage() {
  const identity = useIdentity();
  const user = identity.user;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const config = useQuery({ queryKey: ["config"], queryFn: team.configuration });
  const moduleSettings = getProfileSettings();
  const titles: Record<string, string> = { ...coreTitles };
  for (const setting of moduleSettings) titles[setting.view] = setting.title;

  const requested = params.get("view") || "profile";
  const view = Object.hasOwn(titles, requested) ? requested : "profile";
  const activeModuleSetting = moduleSettings.find((s) => s.view === view);
  const backView =
    view === "password"
      ? "identity"
      : view === "help" && isHelpTopic(params.get("topic"))
        ? "help"
        : "profile";
  const confirm = useConfirm();
  const toast = useToast();
  const [error, setError] = useState("");
  if (!user || identity.dialog) return null;
  const local = identity.vault?.pubkey === user.id;
  const passwordless = local && !!identity.vault?.secret;
  const legacyEncrypted = local && !!identity.vault?.encrypted && !identity.vault?.secret;
  const isOwner = !!config.data?.ownerPubkey && config.data.ownerPubkey === user.id;

  const clearDirty = () =>
    document
      .querySelectorAll('.profile-panel form[data-dirty="true"]')
      .forEach((form) => ((form as HTMLElement).dataset.dirty = "false"));
  async function go(to: string) {
    if (
      document.querySelector('.profile-panel form[data-dirty="true"]') &&
      !(await confirm({
        title: "Discard your changes?",
        description: "Your unsaved changes will be lost.",
        action: "Discard changes",
        danger: true,
      }))
    )
      return;
    clearDirty();
    setError("");
    navigate(to);
  }
  const changeView = (next: string) =>
    void go(next === "profile" ? "/account" : `/account?view=${next}`);
  async function run(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="profile-panel account-page" aria-label={titles[view]}>
      {view !== "profile" && (
        <Button variant="ghost" className="panel-back" onClick={() => changeView(backView)}>
          <ArrowLeft size={16} />
          {titles[backView]}
        </Button>
      )}
      <h1 tabIndex={-1}>{titles[view]}</h1>

      <TransitionView id={view}>
        {view === "profile" ? (
          <>
            <div className="profile-identity">
              <Avatar name={user.name} />
              <div>
                <h3>{user.name || "Your profile"}</h3>
                <span className="profile-role">
                  {isOwner
                    ? "Team Owner"
                    : user.role === "admin"
                      ? "Administrator"
                      : user.role === "member"
                        ? "Member"
                        : "Access pending"}
                </span>
              </div>
              <span className="connected-badge">Identity linked</span>
            </div>
            <div className="settings-list">
              <SettingsRow
                icon={<UserRound size={20} />}
                label="Edit profile"
                detail="Your name and a little about you"
                onClick={() => changeView("edit")}
              />
              {moduleSettings.map((setting) => (
                <SettingsRow
                  key={setting.view}
                  icon={setting.icon}
                  label={setting.label}
                  detail={setting.detail}
                  onClick={() => changeView(setting.view)}
                />
              ))}
              <SettingsRow
                icon={<KeyRound size={20} />}
                label="Identity & recovery"
                detail={
                  passwordless
                    ? "Saved on this device · backup available"
                    : legacyEncrypted
                      ? identity.unlocked
                        ? "Keys unlocked · backup available"
                        : "Keys locked · backup available"
                      : "Connected through your signer"
                }
                onClick={() => changeView("identity")}
              />
            </div>
            <div className="settings-list secondary-settings">
              <SettingsRow
                icon={<CircleHelp size={20} />}
                label="Help"
                detail="Short guides, whenever you need them"
                onClick={() => changeView("help")}
              />
              {user.role === "admin" && (
                <SettingsRow
                  icon={<ShieldCheck size={20} />}
                  label="Administration"
                  detail="Invites, members and resources"
                  onClick={() => void go("/account/admin")}
                />
              )}
              <SettingsRow
                icon={<LogOut size={20} />}
                label="Sign out"
                onClick={() =>
                  void run(async () => {
                    if (
                      !(await confirm({
                        title: "Sign out of BitPolito?",
                        description: "Alerts will stop on this phone until you sign in again.",
                        action: "Sign out",
                      }))
                    )
                      return;
                    await identity.logout();
                  })
                }
              />
            </div>
          </>
        ) : view === "help" ? (
          <Help topic={params.get("topic")} go={(to) => void go(to)} />
        ) : view === "edit" ? (
          <AsyncForm
            submitLabel="Save profile"
            onSubmit={async (data) => {
              await team.saveProfile({
                name: String(data.get("name")),
                about: String(data.get("about") || ""),
              });
              await identity.refresh();
              clearDirty();
              navigate("/account");
              toast("Profile saved.");
            }}
          >
            <Field label="Display name">
              <input
                name="name"
                defaultValue={user.name}
                required
                maxLength={60}
                autoComplete="nickname"
              />
            </Field>
            <Field label="About you">
              <textarea name="about" defaultValue={user.about} rows={3} maxLength={500} />
            </Field>
          </AsyncForm>
        ) : activeModuleSetting ? (
          <activeModuleSetting.Component />
        ) : view === "password" ? (
          <AsyncForm
            submitLabel="Change password & download backup"
            onSubmit={async (data) => {
              const password = String(data.get("password"));
              if (password !== data.get("confirm"))
                throw new FieldError({ confirm: "Passwords do not match" });
              const encrypted = await vaultCall<string>("password", {
                password,
              });
              await downloadText(encrypted, backupName(user.id));
              await saveVault({ pubkey: user.id, encrypted });
              await identity.refreshVault();
              toast("Password changed. Keep the new backup; older copies use the old password.");
            }}
          >
            <p className="small muted">
              Changing the password downloads a new encrypted backup. Keep it safe.
            </p>
            <Field label="New encryption password">
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                name="confirm"
                type="password"
                required
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
              />
            </Field>
          </AsyncForm>
        ) : (
          <div className="recovery-content">
            <Notice tone="info">
              Your Nostr key restores your identity on another device. On a new phone, an
              administrator must approve team access again. Private history is not included.
            </Notice>
            <div className="identity-status">
              <LockKeyhole size={20} />
              <span>
                {passwordless
                  ? "Saved on this device"
                  : legacyEncrypted
                    ? identity.unlocked
                      ? "Unlocked"
                      : "Keys locked"
                    : "External signer"}
              </span>
            </div>
            <p className="small muted">
              Private keys stay on this device or in your Nostr signer and are never sent to a
              server.
            </p>
            {passwordless ? (
              <>
                <Button
                  onClick={() =>
                    void run(async () => {
                      if (
                        !(await confirm({
                          title: "Copy your private key?",
                          description:
                            "Anyone with your nsec key can act as you. Paste it only in a trusted password manager or Nostr signer.",
                          action: "Copy nsec",
                        }))
                      )
                        return;
                      const nsec = await vaultCall<string>("exportSecret");
                      await navigator.clipboard.writeText(nsec);
                      toast("Private key copied. Keep it safe.");
                    })
                  }
                >
                  <Copy size={18} />
                  Copy private key (nsec)
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      const nsec = await vaultCall<string>("exportSecret");
                      await downloadText(nsec, `bitpolito-key-${user.id.slice(0, 8)}.nsec.txt`);
                      toast("Key backup saved.");
                    })
                  }
                >
                  <Download size={18} />
                  Download key backup
                </Button>
              </>
            ) : legacyEncrypted ? (
              <>
                <Button
                  onClick={() =>
                    void run(async () => {
                      await downloadText(identity.vault!.encrypted!, backupName(user.id));
                      toast("Encrypted backup downloaded.");
                    })
                  }
                >
                  <Download size={18} />
                  Download encrypted backup
                </Button>
                <p className="recovery-hint">
                  Recovery needs this backup and its password. BitPolito cannot reset the password.
                </p>
                {identity.unlocked ? (
                  <>
                    <Button variant="secondary" onClick={() => changeView("password")}>
                      Change encryption password
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        identity.lock();
                        toast("Local keys locked. Your app stays connected.");
                      }}
                    >
                      <LockKeyhole size={18} />
                      Lock keys now
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={identity.open}>
                    Unlock identity
                  </Button>
                )}
              </>
            ) : (
              <p className="recovery-hint">
                Your signer manages its private key. Use its backup or export controls to recover it
                on another device.
              </p>
            )}
            <details className="public-identity">
              <summary>Public identity (npub)</summary>
              <code className="key-display">{npubEncode(user.id)}</code>
              <Button
                variant="ghost"
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(npubEncode(user.id));
                    toast("Public identity copied.");
                  })
                }
              >
                <Copy size={16} />
                Copy public identity
              </Button>
            </details>
            <Button
              variant="secondary"
              onClick={() =>
                void run(async () => {
                  if (
                    !(await confirm({
                      title: "Connect another identity?",
                      description:
                        "Your current session will be signed out. Keep a backup of your key before switching.",
                      action: "Switch identity",
                    }))
                  )
                    return;
                  await identity.logout();
                  identity.open();
                })
              }
            >
              Restore or connect another identity
            </Button>
            {local && (
              <Button
                variant="danger"
                onClick={() =>
                  void run(async () => {
                    if (
                      !(await confirm({
                        title: "Remove keys from this device?",
                        description:
                          "You’ll need your saved key backup to return. Your membership and shared content remain.",
                        action: "Remove saved keys",
                        danger: true,
                      }))
                    )
                      return;
                    await forgetVault();
                    await identity.refreshVault();
                    await identity.logout();
                  })
                }
              >
                Remove keys from this device
              </Button>
            )}
          </div>
        )}
      </TransitionView>
      {error && <Notice>{error}</Notice>}
    </section>
  );
}
