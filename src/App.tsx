import { NativeLifecycle, AndroidSandbox } from "./components/NativeApp";
import {hubEnabled} from './lib/hub';
import {HubAccess,HubConnection} from './components/HubAccess';
import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Routes,
  Route,
  useLocation,
  useBlocker,
} from "react-router-dom";
import { House, Grid2X2, UserRound, Copy } from "lucide-react";
import { npubEncode } from "nostr-tools/nip19";
import { useIdentity } from "./lib/identity";
import { Realtime } from "./lib/moo";
import { post, put } from "./lib/api";
import { IdentityDialog } from "./components/IdentityDialog";
import { HomePage, ResourcesPage } from "./components/Home";
import { MooBanner } from "./components/Moo";
import { AccountPage } from "./components/Account";
import { AdministrationPage } from "./components/Admin";
import { useConfirm } from "./components/Feedback";
import { Avatar } from "./components/ui";
import {
  AsyncForm,
  Button,
  Empty,
  ErrorState,
  Field,
  Loading,
  Notice,
} from "./components/ui";
import { OfflineNotice } from "./components/WebApp";
function UnsavedChangesGuard() {
  const confirm = useConfirm();
  const blocker = useBlocker(
    () => !!document.querySelector('form[data-dirty="true"]'),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    void confirm({
      title: "Discard your changes?",
      description: "Your unsaved changes will be lost.",
      action: "Discard changes",
      danger: true,
    }).then((discard) => {
      if (!active) return;
      if (discard) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker.state, confirm]);
  return null;
}
function MemberGate({
  invite,
  clearInvite,
}: {
  invite: string;
  clearInvite: () => void;
}) {
  const identity = useIdentity();
  const [error, setError] = useState(""),
    [token, setToken] = useState(invite),
    [busy, setBusy] = useState(false);
  async function redeem(value: string) {
    setBusy(true);
    setError("");
    try {
      await post("/invites/redeem", { token: value });
      clearInvite();
      await identity.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (identity.user && identity.user.name && invite) void redeem(invite);
  }, [identity.user?.id]);
  return (
    <section className="member-welcome">
      <img src="/brand/loving-cows-blue.svg" alt="Two BitPolito cows" />
      <span className="eyebrow">BITPOLITO HUB</span>
      <h1>
        {identity.user
          ? "Member access required"
          : invite
            ? "Join BitPolito"
            : "Your office. Your team."}
      </h1>
      <p>
        {identity.user
          ? "Use your personal invitation to access the tools and office doorbell."
          : "See who’s in and reach a teammate when you arrive."}
      </p>
      {identity.user ? (
        <>
          <AsyncForm
            submitLabel={busy ? "Checking invitation…" : "Join BitPolito"}
            onSubmit={async (data) => {
              if (!identity.user?.name)
                await put("/profile", { name: data.get("name"), about: "" });
              await redeem(String(data.get("invite")));
            }}
          >
            {!identity.user.name && (
              <Field label="Your name">
                <input name="name" required maxLength={60} />
              </Field>
            )}
            <Field label="Invitation code or link">
              <input
                name="invite"
                required
                value={token}
                onChange={(e) => {
                  const value = e.target.value;
                  try {
                    const url = new URL(value);
                    setToken(
                      new URLSearchParams(url.hash.slice(1)).get("invite") ||
                        value,
                    );
                  } catch {
                    setToken(value);
                  }
                }}
                autoComplete="off"
              />
            </Field>
          </AsyncForm>
          <p className="small muted">
            Need an invitation? Ask a BitPolito administrator.
          </p>
          <details className="bootstrap-help">
            <summary>Your identity</summary>
            <code className="key-display">{npubEncode(identity.user.id)}</code>
            <Button
              variant="ghost"
              onClick={() =>
                void navigator.clipboard
                  .writeText(npubEncode(identity.user!.id))
                  .catch(() =>
                    setError("Select and copy your public identity above."),
                  )
              }
            >
              <Copy size={18} />
              Copy public identity
            </Button>
            <p className="small muted">
              Setting up the first administrator? Grant access to this public
              identity using the local admin command.
            </p>
          </details>
          <Button
            variant="ghost"
            onClick={() =>
              void identity.logout().catch((e) => setError(e.message))
            }
          >
            Sign out
          </Button>
        </>
      ) : (
        <Button onClick={identity.open}>
          {invite ? "Join BitPolito" : "Sign in with Nostr"}
        </Button>
      )}
      {error && (
        <Notice>
          {error}
          <Button
            variant="ghost"
            onClick={() => {
              setToken("");
              clearInvite();
              setError("");
            }}
          >
            Use another invitation
          </Button>
        </Notice>
      )}
    </section>
  );
}
export default function App() {
  const identity = useIdentity(),
    location = useLocation();
  const member = !!identity.user && identity.user.role !== "follower";
  const [invite, setInvite] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("invite") ||
      sessionStorage.getItem("bitpolito.invite") ||
      "",
  );
  useEffect(()=>{const receive=(event:Event)=>setInvite((event as CustomEvent).detail.token);window.addEventListener('bitpolito:invite',receive);return()=>window.removeEventListener('bitpolito:invite',receive);},[]);
  const clearInvite = () => {
    setInvite("");
    sessionStorage.removeItem("bitpolito.invite");
    if (window.location.hash)
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  };
  useEffect(() => {
    if (invite) sessionStorage.setItem("bitpolito.invite", invite);
  }, [invite]);
  useEffect(() => {
    if (member && invite) clearInvite();
  }, [member]);
  const section =
    location.pathname === "/account/admin"
      ? "Administration"
      : location.pathname.startsWith("/account")
        ? "Profile"
        : location.pathname.startsWith("/resources")
          ? "Tools"
          : location.pathname === "/" ? "Home" : "Office";
  useEffect(() => {
    document.title = `${section} · BitPolito`;
    window.scrollTo(0, 0);
    const frame=requestAnimationFrame(()=>{
      if (!document.querySelector('[role="dialog"],[role="alertdialog"]')) document.querySelector<HTMLElement>('main h1')?.focus({preventScroll:true});
    });
    return ()=>cancelAnimationFrame(frame);
  }, [location.pathname, location.search, section]);
  return (
    <div className="app-shell">
      <NativeLifecycle />
      <AndroidSandbox />
      <UnsavedChangesGuard />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="main-shell">
        <header className="topbar">
          <Link to="/" className="office-brand" aria-label="BitPolito Home">
            <img src="/brand/bitpolito-logo-blue.svg" alt="BitPolito" />
          </Link>

        </header>
        <main id="main" className="page-content" tabIndex={-1}>
          <OfflineNotice />
          {identity.error ? (
            <ErrorState
              error={identity.error}
              retry={() => void identity.refresh()}
            />
          ) : !identity.ready ? (
            <Loading />
          ) : !member ? (
            hubEnabled&&identity.user&&location.pathname==='/account'?<AccountPage key={identity.user.id}/>:hubEnabled?<HubAccess invite={invite}/>:<MemberGate invite={invite} clearInvite={clearInvite} />
          ) : (
            <>
              <Realtime />
              {hubEnabled&&<HubConnection/>}
              {!["/", "/office", "/moo"].includes(location.pathname) && <MooBanner />}
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/moo" element={<HomePage />} />
                <Route path="/office" element={<HomePage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route
                  path="/account"
                  element={
                    <AccountPage key={identity.user?.id} />
                  }
                />
                <Route path="/account/admin" element={<AdministrationPage />} />
                {[
                  "/events",
                  "/projects",
                  "/workspace",
                  "/admin",
                  "/members",
                ].map((path) => (
                  <Route
                    key={path}
                    path={path}
                    element={<Navigate to="/" replace />}
                  />
                ))}
                <Route
                  path="*"
                  element={
                    <Empty
                      title="Page not found"
                      action={
                        <Link to="/" className="button secondary">
                          Back to Office
                        </Link>
                      }
                    >
                      Return to your office.
                    </Empty>
                  }
                />
              </Routes>
            </>
          )}
        </main>
        {member && <nav className="bottom-nav" aria-label="Main navigation">
          <NavLink to="/" end className={({isActive})=>isActive||["/office","/moo"].includes(location.pathname)?"active":""}><House size={22}/><span>Home</span></NavLink>
          <NavLink to="/resources"><Grid2X2 size={22}/><span>Tools</span></NavLink>
          <NavLink to="/account"><UserRound size={22}/><span>Profile</span></NavLink>
        </nav>}
      </div>
      {identity.dialog && <IdentityDialog />}
    </div>
  );
}
