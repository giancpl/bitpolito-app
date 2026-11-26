import { isAndroid, Native } from "../lib/native";
import {hubEnabled,setHubSigner} from '../lib/hub';
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  KeyRound,
  Monitor,
  Smartphone,
  Upload,
} from "lucide-react";
import QRCode from "qrcode";
import { api, downloadText } from "../lib/api";
import { useIdentity } from "../lib/identity";
import {
  extensionSigner,
  androidSigner,
  mobileURI,
  remoteSigner,
  type IdentitySigner,
} from "../lib/signers";
import {
  lockVault,
  saveVault,
  vaultCall,
  signLocal,
  localSigner,
  type VaultRecord,
} from "../lib/vault";
import { useConfirm } from "./Feedback";
import {
  AsyncForm,
  Button,
  Field,
  FieldError,
  Modal,
  Notice,
  TransitionView,
} from "./ui";
import type { AppConfig } from "../../shared/contracts";
export function IdentityDialog() {
  const identity = useIdentity();
  const confirm = useConfirm();
  const [mode, setMode] = useState("choose"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [generated, setGenerated] = useState<
      (VaultRecord & { name: string }) | null
    >(null),
    [downloaded, setDownloaded] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [qr, setQR] = useState(""),
    [uri, setURI] = useState(""),
    [authURL, setAuthURL] = useState("");
  const [restore, setRestore] = useState(""),
    [fileSource, setFileSource] = useState("");
  const source = restore || fileSource;
  const abort = useRef(new AbortController());
  const generation = useRef(0);
  const mobile = useRef<ReturnType<typeof mobileURI> | null>(null);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<AppConfig>("/config"),
  });
  const signerRelays=config.data?.signerRelays||config.data?.relays||[];
  useEffect(
    () => () => {
      abort.current.abort();
      mobile.current?.dispose();
    },
    [],
  );
  const cancelPending = () => {
    generation.current++;
    abort.current.abort();
    if (!identity.user) lockVault();
  };
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(signer: IdentitySigner, name?: string) {
    try {
      await identity.connect(signer, name, abort.current.signal);
    } catch (e) {
      await signer.close?.();
      throw e;
    }
  }
  async function local(record: VaultRecord, name?: string) {
    await saveVault(record);
    await identity.refreshVault();
    identity.unlock();
    await connect(localSigner(record.pubkey), name);
  }
  const choose = async (next: string) => {
    if (
      document.querySelector('[role="dialog"] form[data-dirty="true"]') &&
      !(await confirm({
        title: "Discard your changes?",
        description: "Your unsaved sign-in details will be lost.",
        action: "Discard changes",
        danger: true,
      }))
    )
      return;
    abort.current.abort();
    abort.current = new AbortController();
    generation.current++;
    mobile.current?.dispose();
    mobile.current = null;
    setQR("");
    setURI("");
    setMode(next);
    setError("");
  };
  return (
    <Modal
      title={
        generated
          ? "Keep your identity safe"
          : mode === "choose"
            ? "Welcome to BitPolito"
            : mode === "create"
              ? "Create your identity"
              : mode === "unlock"
                ? "Unlock your identity"
                : mode === "restore"
                  ? "Restore your identity"
                  : mode === "existing"
                    ? "Use my Nostr identity"
                    : "Connect your signer"
      }
      onClose={identity.close}
      onClosing={cancelPending}
      className="identity-panel"
      beforeClose={async () =>
        !generated ||
        confirmed ||
        (await confirm({
          title: "Leave before saving your backup?",
          description:
            "You need the encrypted backup and its password to recover this identity.",
          action: "Leave setup",
          danger: true,
        }))
      }
    >
      {mode !== "choose" && !generated && (
        <button className="text-button" onClick={() => choose("choose")}>
          <ArrowLeft size={18} />
          All sign-in options
        </button>
      )}
      <TransitionView id={generated ? "backup" : mode}>
        {hubEnabled&&<p className="small muted">Connecting allows identity proofs, relay discovery and NIP-44 encrypted invitations. Your name, profile and contacts are not published publicly.</p>}
        {generated ? (
          <div className="form">
            <div className="wizard-progress" aria-label="Step 2 of 2">
              <span />
              <span />
            </div>
            <p className="step-label">Step 2 of 2 · Recovery backup</p>
            <img
              className="identity-cow"
              src="/brand/cow-icon-blue.svg"
              alt=""
            />
            <p>
              Your keys belong to you. Recovery requires both this encrypted
              backup and its password.
            </p>
            <Button
              variant="secondary"
              onClick={() => void run(async () => {
                await downloadText(
                  generated.encrypted,
                  `bitpolito-${generated.pubkey.slice(0, 8)}.ncryptsec`,
                );
                setDownloaded(true);
              })}
            >
              <Download size={18} />
              Download encrypted backup{downloaded && <Check size={18} />}
            </Button>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I saved my backup and understand that BitPolito cannot reset its
              password.
            </label>
            <Button
              busy={busy}
              disabled={!downloaded || !confirmed}
              onClick={() => void run(() => local(generated, generated.name))}
            >
              Continue to BitPolito
              <ArrowRight size={18} />
            </Button>
          </div>
        ) : mode === "choose" ? (
          <>
            <p className="muted">
              A familiar name. Your own keys. Everything you need to join the
              office.
            </p>
            <div className="signin-options">
              {identity.vault && (
                <button
                  onClick={() => choose("unlock")}
                  className="saved-key-option"
                >
                  <KeyRound />
                  <span>
                    <strong>Unlock saved identity</strong>
                    <small>Continue with the keys on this device</small>
                  </span>
                  <ArrowRight />
                </button>
              )}
              <button
                className={!identity.vault ? "saved-key-option" : ""}
                onClick={() => void choose("create")}
              >
                <KeyRound />
                <span>
                  <strong>Create an identity</strong>
                  <small>New here? Start with a name and a secure backup</small>
                </span>
                <ArrowRight />
              </button>
              <button onClick={() => choose("existing")}>
                <Monitor />
                <span>
                  <strong>Use my Nostr identity</strong>
                  <small>{isAndroid?"Use an Android or remote signer":"Connect an extension or mobile signer"}</small>
                </span>
                <ArrowRight />
              </button>
            </div>
            <Button variant="ghost" onClick={() => choose("restore")}>
              <Upload size={18} />
              Restore identity
            </Button>
          </>
        ) : mode === "create" ? (
          <AsyncForm
            submitLabel="Create identity"
            onSubmit={async (data) => {
              if (
                identity.vault &&
                !(await confirm({
                  title: "Replace the saved identity?",
                  description:
                    "Keep its backup and password before continuing. This changes the keys stored on this device.",
                  action: "Replace saved keys",
                  danger: true,
                }))
              )
                return;
              const password = String(data.get("password"));
              if (password !== data.get("confirm"))
                throw new FieldError({ confirm: "Passwords do not match" });
              const record = await vaultCall<VaultRecord>("create", {
                password,
              });
              setGenerated({ ...record, name: String(data.get("name")) });
            }}
          >
            <div className="wizard-progress" aria-label="Step 1 of 2">
              <span />
              <span className="step-next" />
            </div>
            <p className="step-label">Step 1 of 2 · Your identity</p>
            <Field label="Your name">
              <input
                name="name"
                required
                maxLength={60}
                autoComplete="nickname"
              />
            </Field>
            <Field
              label="Key encryption password"
              help="At least 12 characters. This encrypts your keys on this device; it is never sent to BitPolito."
            >
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password">
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
        ) : mode === "unlock" ? (
          <AsyncForm
            submitLabel="Unlock and continue"
            onSubmit={async (data) => {
              if (!identity.vault) throw Error("No saved identity.");
              const pubkey = await vaultCall<string>("unlock", {
                encrypted: identity.vault.encrypted,
                password: String(data.get("password")),
              });
              identity.unlock();
              if (identity.user?.id === pubkey) {if(hubEnabled)setHubSigner(localSigner(pubkey));identity.close();}
              else await connect(localSigner(pubkey));
            }}
          >
            <p className="muted">
              Unlock the keys saved on this device. Your app session can remain
              connected while your keys are locked.
            </p>
            <Field label="Key encryption password">
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
          </AsyncForm>
        ) : mode === "restore" ? (
          <AsyncForm
            submitLabel="Restore and continue"
            onSubmit={async (data) => {
              const file = data.get("backup") as File,
                pasted = String(data.get("key") || "").trim();
              if (file?.size && pasted)
                throw Error("Choose a file or paste a key, not both.");
              if (file?.size > 512)
                throw Error("Choose a valid small key backup.");
              const key = file?.size ? (await file.text()).trim() : pasted;
              if (!key.startsWith("ncryptsec1") && !key.startsWith("nsec1"))
                throw new FieldError({
                  key: "Use an ncryptsec backup or nsec private key; an npub alone cannot sign in.",
                });
              const password = String(data.get("password"));
              if (key.startsWith("nsec1") && password !== data.get("confirm"))
                throw new FieldError({ confirm: "Passwords do not match" });
              if (
                identity.vault &&
                !(await confirm({
                  title: "Replace the saved identity?",
                  description:
                    "Keep its backup and password before continuing. This changes the keys stored on this device.",
                  action: "Replace saved keys",
                  danger: true,
                }))
              )
                return;
              const record = await vaultCall<VaultRecord>("restore", {
                key,
                password,
              });
              await local(record);
            }}
          >
            <p className="muted">
              Restore an encrypted backup or import an existing private key.
              Everything is processed on this device.
            </p>
            {isAndroid ? <Button variant="secondary" onClick={() => void run(async()=>{setRestore((await Native.importBackup()).content);})}>Choose encrypted backup</Button> : <Field label="Backup file">
              <input
                type="file"
                name="backup"
                accept=".ncryptsec,.nsec,.txt"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  setFileSource(
                    file && file.size <= 512 ? (await file.text()).trim() : "",
                  );
                }}
              />
            </Field>}
            <Field label="Or paste your key">
              <textarea
                name="key"
                value={restore}
                onChange={(e) => setRestore(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                rows={3}
              />
            </Field>
            <Field
              label={
                source.startsWith("nsec1")
                  ? "New encryption password"
                  : "Backup password"
              }
            >
              <input
                name="password"
                type="password"
                required
                minLength={source.startsWith("nsec1") ? 12 : undefined}
                maxLength={200}
                autoComplete="off"
              />
            </Field>
            {source.startsWith("nsec1") && (
              <Field label="Confirm password">
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                />
              </Field>
            )}
          </AsyncForm>
        ) : mode === "existing" ? (
          <div className="signin-options">
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => connect(await (isAndroid ? androidSigner() : extensionSigner())))
              }
            >
              <Monitor />
              <span>
                <strong>{isAndroid ? "Android signer" : "Browser extension"}</strong>
                <small>Approve access in your Nostr signer</small>
              </span>
              <ArrowRight />
            </button>
            <button onClick={() => choose("remote")}>
              <Smartphone />
              <span>
                <strong>Remote or mobile signer</strong>
                <small>Connect with a link or QR code</small>
              </span>
              <ArrowRight />
            </button>
          </div>
        ) : (
          <>
            <AsyncForm
              submitLabel="Connect signer"
              onSubmit={async (data) =>
                connect(
                  await remoteSigner(
                    String(data.get("bunker")),
                    signerRelays,
                    abort.current.signal,
                    setAuthURL,
                  ),
                )
              }
            >
              <Field label="Bunker connection link">
                <input
                  name="bunker"
                  required
                  placeholder="bunker://…"
                  autoComplete="off"
                />
              </Field>
            </AsyncForm>
            <div className="divider">
              <span>or connect from your phone</span>
            </div>
            {uri ? (
              <div className="qr-connect">
                <img src={qr} alt="Nostr signer connection QR code" />
                <a className="text-button" href={uri}>
                  Open in your signer
                </a>
                <p className="muted">Waiting for approval…</p>
                <Button variant="secondary" onClick={() => choose("remote")}>
                  Cancel connection
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                busy={busy}
                onClick={() =>
                  void run(async () => {
                    const current = ++generation.current;
                    mobile.current = mobileURI(signerRelays);
                    setURI(mobile.current.uri);
                    setQR(
                      await QRCode.toDataURL(mobile.current.uri, {
                        margin: 1,
                        color: { dark: "#001CE0", light: "#ffffff" },
                      }),
                    );
                    const signer = await mobile.current.connect(
                      abort.current.signal,
                      setAuthURL,
                    );
                    if (generation.current !== current) {
                      await signer.close?.();
                      return;
                    }
                    mobile.current = null;
                    await connect(signer);
                  })
                }
              >
                Show connection QR code
              </Button>
            )}
            {!signerRelays.length && (
              <p className="small muted">
                A configured relay is needed for remote/mobile signers. Browser
                extensions and local identities work without one.
              </p>
            )}
          </>
        )}
      </TransitionView>
      {authURL && /^https:\/\//.test(authURL) && (
        <a
          className="text-button"
          target="_blank"
          rel="noreferrer"
          href={authURL}
        >
          Approve access in your signer
        </a>
      )}
      {error && <Notice>{error}</Notice>}
    </Modal>
  );
}
