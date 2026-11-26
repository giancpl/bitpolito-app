import {hubEnabled} from '../lib/hub';
import {isAndroid} from "../lib/native";
import {AndroidNotifications} from "./AndroidNotifications";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { npubEncode } from "nostr-tools/nip19";
import {
  ArrowLeft,
  Bell,
  Copy,
  Download,
  KeyRound,
  LogOut,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  UserRound,
  FolderOpen,
  CircleHelp,
} from "lucide-react";
import { useIdentity } from "../lib/identity";
import { put, downloadText } from "../lib/api";
import { saveVault, forgetVault, vaultCall } from "../lib/vault";
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
import { InstallWebApp } from "./WebApp";
import { Notifications } from "./Notifications";
import { MooBanner } from "./Moo";
import { Help, isHelpTopic } from "./Help";
const titles: Record<string, string> = {
  profile: "Profile",
  edit: "Edit profile",
  alerts: "Office alerts",
  identity: "Identity & recovery",
  password: "Change encryption password",
  install: "Install BitPolito",
  help: "Help",
};
export function AccountPage() {
  const identity = useIdentity(),
    user = identity.user;
  const navigate = useNavigate(),
    [params] = useSearchParams();
  const requested = params.get("view") || "profile",
    view = Object.hasOwn(titles, requested) ? requested : "profile";
  const backView = view === "password" ? "identity"
    : view === "help" && isHelpTopic(params.get("topic")) ? "help" : "profile";
  const confirm = useConfirm(),
    toast = useToast();
  const [error, setError] = useState("");
  if (!user || identity.dialog) return null;
  const local = identity.vault?.pubkey === user.id;
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
      <h1 tabIndex={-1}>{titles[view]}</h1>{hubEnabled&&view==='identity'&&<Notice>Your encrypted backup restores your Nostr identity. On a new phone, an administrator must approve group access again. Private history is not included.</Notice>}
      {view !== "profile" && (
        <Button
          variant="ghost"
          className="panel-back"
          onClick={() =>
            changeView(backView)
          }
        >
          <ArrowLeft size={16} />
          {titles[backView]}
        </Button>
      )}

      <TransitionView id={view}>
        {view === "profile" ? (
          <>
            <div className="profile-identity">
              <Avatar name={user.name} />
              <div>
                <h3>{user.name || "Your profile"}</h3>
                <span className="profile-role">
                  {user.role === "admin" ? "Administrator" : user.role === "member" ? "Member" : "Access pending"}
                </span>
              </div>
              <span className="connected-badge">{hubEnabled?"Identity linked":"Connected"}</span>
            </div>
            <div className="settings-list">
              <SettingsRow
                icon={<UserRound size={20} />}
                label="Edit profile"
                detail="Your name and a little about you"
                onClick={() => changeView("edit")}
              />
              <SettingsRow
                icon={<Bell size={20} />}
                label="Office alerts"
                detail="Cow sound and notifications"
                onClick={() => changeView("alerts")}
              />
              <SettingsRow
                icon={<KeyRound size={20} />}
                label="Identity & recovery"
                detail={
                  local
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
              {!isAndroid && <SettingsRow icon={<Smartphone size={20} />} label="Install app" onClick={() => changeView("install")} />}
              <SettingsRow
                icon={<FolderOpen size={20} />}
                label="Tools & resources"
                onClick={() => void go("/resources")}
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
                onClick={() => void run(identity.logout)}
              />
            </div>
          </>
        ) : view === "help" ? (
          <Help topic={params.get("topic")} go={(to) => void go(to)} />
        ) : view === "edit" ? (
          <AsyncForm
            submitLabel="Save profile"
            onSubmit={async (data) => {
              await put("/profile", {
                name: data.get("name"),
                about: data.get("about"),
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
              <textarea
                name="about"
                defaultValue={user.about}
                rows={3}
                maxLength={500}
              />
            </Field>
          </AsyncForm>
        ) : view === "alerts" ? (
          isAndroid ? <AndroidNotifications /> : hubEnabled ? <Notice>Office alerts run in the Android app. This browser is a simulator.</Notice> : <Notifications />
        ) : view === "install" ? (
          <InstallWebApp />
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
              await downloadText(
                encrypted,
                `bitpolito-${user.id.slice(0, 8)}.ncryptsec`,
              );
              await saveVault({ pubkey: user.id, encrypted });
              await identity.refreshVault();
              toast(
                "Password changed. Keep the new backup; older copies use the old password.",
              );
            }}
          >
            <p className="small muted">
              Changing the password downloads a new encrypted backup. Keep it
              safe.
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
            <div className="identity-status">
              <LockKeyhole size={20} />
              <span>
                {local
                  ? identity.unlocked
                    ? "Unlocked"
                    : "Keys locked"
                  : "External identity"}
              </span>
            </div>
            <p className="small muted">
              Your app stays connected when your keys lock. Private keys stay on
              your device or in your signer.
            </p>
            {local ? (
              <>
                <Button
                  onClick={() => void run(async () => {
                    await downloadText(
                      identity.vault!.encrypted,
                      `bitpolito-${user.id.slice(0, 8)}.ncryptsec`,
                    );
                    toast("Encrypted backup downloaded.");
                  })}
                >
                  <Download size={18} />
                  Download encrypted backup
                </Button>
                <p className="recovery-hint">
                  Recovery needs this backup and its password. BitPolito cannot
                  reset the password.
                </p>
                {identity.unlocked ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => changeView("password")}
                    >
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
                Your signer manages its private key. Use its backup or export
                controls to recover it on another device.
              </p>
            )}
            <details className="public-identity">
              <summary>Public identity</summary>
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
                        "Your current session will be signed out. Keep your recovery backup before switching.",
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
                          "You’ll need the encrypted backup and its password to return. Your membership and shared content remain.",
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
