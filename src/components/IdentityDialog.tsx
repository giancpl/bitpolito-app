import { isAndroid, Native } from "../lib/native";
import { setHubSigner, team } from "../lib/hub";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, KeyRound, Monitor, Smartphone, Upload } from "lucide-react";
import QRCode from "qrcode";
import { useIdentity } from "../lib/identity";
import {
  extensionSigner,
  androidSigner,
  mobileURI,
  remoteSigner,
  type IdentitySigner,
} from "../lib/signers";
import { lockVault, saveVault, vaultCall, localSigner, type VaultRecord } from "../lib/vault";
import { useConfirm } from "./Feedback";
import { AsyncForm, Button, Field, FieldError, Modal, Notice, TransitionView } from "./ui";

export function IdentityDialog() {
  const identity = useIdentity();
  const confirm = useConfirm();
  const [mode, setMode] = useState("choose");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQR] = useState("");
  const [uri, setURI] = useState("");
  const [authURL, setAuthURL] = useState("");
  const [restore, setRestore] = useState("");
  const [fileSource, setFileSource] = useState("");
  const source = (restore || fileSource).trim();
  const needsBackupPassword = source.startsWith("ncryptsec1");

  const abort = useRef(new AbortController());
  const generation = useRef(0);
  const mobile = useRef<ReturnType<typeof mobileURI> | null>(null);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: team.configuration,
  });
  const signerRelays = config.data?.signerRelays || config.data?.relays || [];

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
    if (!identity.user && !identity.vault?.secret) lockVault();
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

  async function continueSaved() {
    const saved = identity.vault;
    if (!saved) return;
    if (saved.secret) {
      await run(async () => {
        const pubkey = await vaultCall<string>("loadSecret", { secret: saved.secret });
        identity.unlock();
        if (identity.user?.id === pubkey) {
          setHubSigner(localSigner(pubkey));
          identity.close();
        } else {
          await connect(localSigner(pubkey));
        }
      });
    } else {
      await choose("unlock");
    }
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
        mode === "choose"
          ? "Welcome to BitPolito"
          : mode === "create"
            ? "Create your profile"
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
    >
      {mode !== "choose" && (
        <button className="text-button" onClick={() => void choose("choose")}>
          <ArrowLeft size={18} />
          All sign-in options
        </button>
      )}
      <TransitionView id={mode}>
        {mode === "choose" ? (
          <>
            <p className="muted">
              A familiar name. Your own keys. Everything you need to join the team.
            </p>
            <p className="small muted privacy-note">
              Your private key stays protected on this device or in your Nostr signer. Your profile
              is shared only inside the encrypted team.
            </p>
            <div className="signin-options">
              {identity.vault && (
                <button
                  disabled={busy}
                  onClick={() => void continueSaved()}
                  className="saved-key-option"
                >
                  <KeyRound />
                  <span>
                    <strong>
                      {identity.vault.secret
                        ? "Continue with saved identity"
                        : "Unlock saved identity"}
                    </strong>
                    <small>Use the personal profile saved on this device</small>
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
                  <strong>Create a profile</strong>
                  <small>New here? Just enter your name to get started</small>
                </span>
                <ArrowRight />
              </button>
              <button onClick={() => void choose("existing")}>
                <Monitor />
                <span>
                  <strong>Use my Nostr identity</strong>
                  <small>
                    {isAndroid
                      ? "Connect Amber or another Nostr signer"
                      : "Connect an extension or mobile signer"}
                  </small>
                </span>
                <ArrowRight />
              </button>
            </div>
            <Button variant="ghost" onClick={() => void choose("restore")}>
              <Upload size={18} />
              Import existing key (nsec)
            </Button>
          </>
        ) : mode === "create" ? (
          <AsyncForm
            submitLabel="Continue to BitPolito"
            onSubmit={async (data) => {
              if (
                identity.vault &&
                !(await confirm({
                  title: "Replace the saved identity?",
                  description:
                    "Make sure you saved your previous key if you still need it. This replaces the local key on this device.",
                  action: "Replace saved key",
                  danger: true,
                }))
              )
                return;
              const name = String(data.get("name")).trim();
              if (!name) throw new FieldError({ name: "Enter your name" });
              const record = await vaultCall<VaultRecord>("createQuick");
              await local(record, name);
            }}
          >
            <p className="muted">
              Your key is created automatically and stored safely on this device. You can export a
              backup anytime from your profile.
            </p>
            <Field label="Your name">
              <input
                name="name"
                required
                maxLength={60}
                autoComplete="nickname"
                placeholder="e.g. Marco Rossi"
              />
            </Field>
          </AsyncForm>
        ) : mode === "unlock" ? (
          <AsyncForm
            submitLabel="Unlock and continue"
            onSubmit={async (data) => {
              if (!identity.vault?.encrypted) throw Error("No encrypted identity found.");
              const pubkey = await vaultCall<string>("unlock", {
                encrypted: identity.vault.encrypted,
                password: String(data.get("password")),
              });
              identity.unlock();
              if (identity.user?.id === pubkey) {
                setHubSigner(localSigner(pubkey));
                identity.close();
              } else await connect(localSigner(pubkey));
            }}
          >
            <p className="muted">Unlock the password-protected backup saved on this device.</p>
            <Field label="Backup password">
              <input name="password" type="password" required autoComplete="current-password" />
            </Field>
          </AsyncForm>
        ) : mode === "restore" ? (
          <AsyncForm
            submitLabel="Restore and continue"
            onSubmit={async (data) => {
              const file = data.get("backup") as File;
              const pasted = String(data.get("key") || "").trim();
              if (file?.size && pasted) throw Error("Choose a file or paste a key, not both.");
              if (file?.size > 512) throw Error("Choose a valid small key backup.");
              const key = file?.size ? (await file.text()).trim() : pasted;
              if (!key.startsWith("ncryptsec1") && !key.startsWith("nsec1"))
                throw new FieldError({
                  key: "Paste a private nsec1 key or an ncryptsec1 backup; an npub alone cannot sign in.",
                });
              if (
                identity.vault &&
                !(await confirm({
                  title: "Replace the saved identity?",
                  description:
                    "Keep a copy of your current key if you still need it. This changes the key stored on this device.",
                  action: "Replace saved key",
                  danger: true,
                }))
              )
                return;
              const record = await vaultCall<VaultRecord>("restore", {
                key,
                password: String(data.get("password") || ""),
              });
              await local(record);
            }}
          >
            <p className="muted">
              Paste your Nostr private key (<code>nsec1…</code>) or load an existing backup file.
              Everything stays on this device.
            </p>
            {isAndroid ? (
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    setRestore((await Native.importBackup()).content);
                  })
                }
              >
                Choose backup file
              </Button>
            ) : (
              <Field label="Backup file">
                <input
                  type="file"
                  name="backup"
                  accept=".ncryptsec,.nsec,.txt"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    setFileSource(file && file.size <= 512 ? (await file.text()).trim() : "");
                  }}
                />
              </Field>
            )}
            <Field label="Or paste your key">
              <textarea
                name="key"
                value={restore}
                onChange={(e) => setRestore(e.target.value)}
                placeholder="nsec1… or ncryptsec1…"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                rows={3}
              />
            </Field>
            {needsBackupPassword && (
              <Field label="Backup password">
                <input
                  name="password"
                  type="password"
                  required
                  maxLength={200}
                  autoComplete="off"
                />
              </Field>
            )}
          </AsyncForm>
        ) : mode === "existing" ? (
          <div className="signin-options">
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  connect(await (isAndroid ? androidSigner() : extensionSigner())),
                )
              }
            >
              <Monitor />
              <span>
                <strong>{isAndroid ? "Android signer" : "Browser extension"}</strong>
                <small>Approve access in your Nostr signer (e.g. Amber)</small>
              </span>
              <ArrowRight />
            </button>
            <button onClick={() => void choose("remote")}>
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
                <input name="bunker" required placeholder="bunker://…" autoComplete="off" />
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
                <Button variant="secondary" onClick={() => void choose("remote")}>
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
                    const signer = await mobile.current.connect(abort.current.signal, setAuthURL);
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
                A configured relay is needed for remote/mobile signers. Browser extensions and local
                identities work without one.
              </p>
            )}
          </>
        )}
      </TransitionView>
      {authURL && /^https:\/\//.test(authURL) && (
        <a className="text-button" target="_blank" rel="noreferrer" href={authURL}>
          Approve access in your signer
        </a>
      )}
      {error && <Notice>{error}</Notice>}
    </Modal>
  );
}
