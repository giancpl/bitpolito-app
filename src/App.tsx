import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useBlocker, useLocation } from "react-router-dom";
import { LayoutGroup, motion } from "motion/react";
import { Grid2X2, House, UserRound } from "lucide-react";
import { hubEnabled } from "./lib/hub";
import { useIdentity } from "./lib/identity";
import {
  allModuleRoutes,
  findModuleTitle,
  isAnyModuleRoute,
  isModuleRoute,
  modules,
} from "./modules/registry";
import { AccountPage } from "./components/Account";
import { AndroidSandbox, NativeLifecycle } from "./components/NativeApp";
import { useConfirm } from "./components/Feedback";
import { HomePage } from "./components/Home";
import { ResourcesPage } from "./components/Tools";
import { ConnectionStatus, HubAccess } from "./components/HubAccess";
import { Empty, ErrorState, Loading } from "./components/ui";

// Rarely used, heavier screens load on demand to keep app start fast.
const AdministrationPage = lazy(() =>
  import("./components/Admin").then((m) => ({ default: m.AdministrationPage })),
);
const IdentityDialog = lazy(() =>
  import("./components/IdentityDialog").then((m) => ({ default: m.IdentityDialog })),
);

const pageEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

function UnsavedChangesGuard() {
  const confirm = useConfirm();
  const blocker = useBlocker(() => !!document.querySelector('form[data-dirty="true"]'));
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
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
      if (discard) blockerRef.current.proceed?.();
      else blockerRef.current.reset?.();
    });
    return () => {
      active = false;
    };
  }, [blocker.state, confirm]);
  return null;
}

function AndroidOnly() {
  return (
    <section className="member-welcome">
      <img src="/brand/loving-cows-blue.svg" alt="Two BitPolito cows" />
      <span className="eyebrow">BitPolito Hub</span>
      <h1>Open BitPolito on your phone</h1>
      <p>
        The encrypted team runs in the BitPolito Android app. Ask an administrator for the app and
        your personal invitation.
      </p>
    </section>
  );
}

function readInvite() {
  return (
    new URLSearchParams(window.location.hash.slice(1)).get("invite") ||
    sessionStorage.getItem("bitpolito.invite") ||
    ""
  );
}

const sectionTitle = (path: string) =>
  path === "/account/admin"
    ? "Administration"
    : path.startsWith("/account")
      ? "Profile"
      : path.startsWith("/resources")
        ? "Tools"
        : path === "/"
          ? "Home"
          : (findModuleTitle(path) ?? "BitPolito");

export default function App() {
  const identity = useIdentity();
  const location = useLocation();
  const member = !!identity.user && identity.user.role !== "follower";
  const [invite, setInvite] = useState(readInvite);
  useEffect(() => {
    const receive = (event: Event) =>
      setInvite((event as CustomEvent<{ token: string }>).detail.token);
    window.addEventListener("bitpolito:invite", receive);
    return () => window.removeEventListener("bitpolito:invite", receive);
  }, []);
  useEffect(() => {
    if (invite) sessionStorage.setItem("bitpolito.invite", invite);
  }, [invite]);
  useEffect(() => {
    if (!member || !invite) return;
    setInvite("");
    sessionStorage.removeItem("bitpolito.invite");
    if (window.location.hash)
      history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [member, invite]);

  const section = sectionTitle(location.pathname);
  useEffect(() => {
    document.title = `${section} · BitPolito`;
    window.scrollTo(0, 0);
    // Move focus to the new page heading for screen readers, unless a dialog owns focus.
    const frame = requestAnimationFrame(() => {
      if (!document.querySelector('[role="dialog"],[role="alertdialog"]'))
        document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.search, section]);

  const homeActive = location.pathname === "/" || isAnyModuleRoute(location.pathname);
  const toolsActive = location.pathname.startsWith("/resources");
  const profileActive = location.pathname.startsWith("/account");

  let content;
  if (!hubEnabled) content = <AndroidOnly />;
  else if (identity.error)
    content = <ErrorState error={identity.error} retry={() => void identity.refresh()} />;
  else if (!identity.ready) content = <Loading />;
  else if (!member)
    content =
      identity.user && location.pathname === "/account" ? (
        <AccountPage key={identity.user.id} />
      ) : (
        <HubAccess invite={invite} />
      );
  else
    content = (
      <>
        <ConnectionStatus />
        {location.pathname !== "/" &&
          modules.map((mod) =>
            mod.GlobalBanner && !isModuleRoute(location.pathname, mod) ? (
              <mod.GlobalBanner key={mod.id} />
            ) : null,
          )}
        <motion.div
          key={location.pathname}
          className="page-transition"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: pageEase }}
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            {allModuleRoutes().map((route) => {
              const Element = route.element;
              return <Route key={route.path} path={route.path} element={<Element />} />;
            })}
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/account" element={<AccountPage key={identity.user?.id} />} />
            <Route
              path="/account/admin"
              element={
                <Suspense fallback={<Loading />}>
                  <AdministrationPage />
                </Suspense>
              }
            />
            {["/events", "/projects", "/workspace", "/admin", "/members"].map((path) => (
              <Route key={path} path={path} element={<Navigate to="/" replace />} />
            ))}
            <Route
              path="*"
              element={
                <Empty
                  title="Page not found"
                  action={
                    <Link to="/" className="button secondary">
                      Back to Home
                    </Link>
                  }
                >
                  This page doesn’t exist in the app.
                </Empty>
              }
            />
          </Routes>
        </motion.div>
      </>
    );

  return (
    <div className="app-shell">
      <NativeLifecycle />
      <AndroidSandbox />
      <UnsavedChangesGuard />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className={`main-shell ${member ? "has-nav" : ""}`}>
        <header className="topbar">
          <Link to="/" className="office-brand" aria-label="BitPolito Home">
            <img src="/brand/bitpolito-logo-blue.svg" alt="BitPolito" />
          </Link>
        </header>
        <main id="main" className="page-content" tabIndex={-1}>
          {content}
        </main>
        {member && (
          <LayoutGroup>
            <nav className="bottom-nav" aria-label="Main navigation">
              <NavLink to="/" end className={homeActive ? "active" : ""}>
                {homeActive && (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    className="nav-pill"
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                    aria-hidden="true"
                  />
                )}
                <House size={22} />
                <span>Home</span>
              </NavLink>
              <NavLink to="/resources" className={toolsActive ? "active" : ""}>
                {toolsActive && (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    className="nav-pill"
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                    aria-hidden="true"
                  />
                )}
                <Grid2X2 size={22} />
                <span>Tools</span>
              </NavLink>
              <NavLink to="/account" className={profileActive ? "active" : ""}>
                {profileActive && (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    className="nav-pill"
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                    aria-hidden="true"
                  />
                )}
                <UserRound size={22} />
                <span>Profile</span>
              </NavLink>
            </nav>
          </LayoutGroup>
        )}
      </div>
      {identity.dialog && (
        <Suspense fallback={null}>
          <IdentityDialog />
        </Suspense>
      )}
    </div>
  );
}
