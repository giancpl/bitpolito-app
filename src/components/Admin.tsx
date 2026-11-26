import { useState } from "react";
import {hubEnabled} from '../lib/hub';
import {HubApplications} from './HubApplications';
import {ResourceImport} from './ResourceImport';
import {RelaySettings} from './RelaySettings';
import {InviteQRCode} from './InviteQRCode';
import { Link, Navigate } from "react-router-dom";
import { Tabs, DropdownMenu } from "radix-ui";
import { useIdentity } from "../lib/identity";
import { useConfirm, useToast } from "./Feedback";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Plus,
  ShieldCheck,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { api, post, put, remove } from "../lib/api";
import {
  AsyncForm,
  Button,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  Notice,
} from "./ui";
import type { Invite, Resource, User } from "../../shared/contracts";
export function AdministrationPage() {
  const { user } = useIdentity();
  if (user?.role !== "admin") return <Navigate to="/account" replace />;
  return (
    <>
      <div className="admin-page-heading">
        <Link className="text-button" to="/account">
          ← Profile
        </Link>
        <h1>
          Administration<span>.</span>
        </h1>
        <p className="muted">Keep your team connected.</p>
      </div>
      <Administration />
      {hubEnabled&&<RelaySettings/>}
    </>
  );
}
export function Administration() {
  const confirm = useConfirm(),
    toast = useToast();
  const client = useQueryClient();
  const [tab, setTab] = useState("invites"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [editor, setEditor] = useState<Resource | "new" | null>(null);
  const invites = useQuery({
      queryKey: ["invites"],
      queryFn: () => api<Invite[]>("/invites"),
    }),
    members = useQuery({
      queryKey: ["members"],
      queryFn: () => api<User[]>("/admin/members"),
    }),
    resources = useQuery({
      queryKey: ["resources"],
      queryFn: () => api<Resource[]>("/resources"),
    });
  async function run(fn: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await client.invalidateQueries();
      if (message) toast(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-card administration">
      <h2>
        <ShieldCheck size={22} />
        Administration
      </h2>
      <Tabs.Root
        value={tab}
        onValueChange={(next) =>
          void (async () => {
            if (
              document.querySelector(
                '.administration form[data-dirty="true"]',
              ) &&
              !(await confirm({
                title: "Discard your changes?",
                description: "Your unsaved invitation will be lost.",
                action: "Discard changes",
                danger: true,
              }))
            )
              return;
            setTab(next);
          })()
        }
      >
        <Tabs.List className="tabs" aria-label="Administration sections">
          {["invites", "members", "resources"].map((t) => (
            <Tabs.Trigger key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value={tab} className="admin-tab-content">
          {error && <Notice>{error}</Notice>}
          {hubEnabled&&tab==='resources'&&<ResourceImport/>}
          {tab === "invites" ? (
            <>
              {hubEnabled&&<HubApplications members={members.data||[]}/>}
              <AsyncForm
                submitLabel="Create invitation"
                onSubmit={async (data) => {
                  const result = await post<{ token: string }>("/invites", {
                    label: data.get("label"),
                  });
                  setLink(hubEnabled?`bitpolito://join#invite=${result.token}`:`${location.origin}/#invite=${result.token}`);
                  toast("Invitation created. Copy the personal link below.");
                  await client.invalidateQueries({ queryKey: ["invites"] });
                }}
              >
                <Field label="Who is this invitation for?">
                  <input
                    name="label"
                    required
                    maxLength={80}
                    placeholder="Name or a short label"
                  />
                </Field>
                <p className="small muted">
                  One person, one invitation. It expires in seven days.
                </p>
              </AsyncForm>
              {link && (
                <div className="invite-link">
                  {hubEnabled&&<InviteQRCode value={link}/>}
                  <Field label="Invitation link">
                    <input
                      readOnly
                      value={link}
                      onFocus={(e) => e.target.select()}
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void run(async () => {
                        await navigator.clipboard.writeText(link);
                      })
                    }
                  >
                    <Copy size={18} />
                    Copy link
                  </Button>
                  <p className="small muted">
                    Copy it now and share it personally. The full link is shown
                    only here.
                  </p>
                </div>
              )}
              {invites.isLoading ? (
                <Loading />
              ) : invites.error ? (
                <ErrorState
                  error={invites.error}
                  retry={() => void invites.refetch()}
                />
              ) : (
                <div className="admin-rows">
                  {invites.data?.map((i) => (
                    <div key={i.id}>
                      <div>
                        <strong>{i.label}</strong>
                        <span className="small muted">
                          {i.usedAt
                            ? "Used"
                            : i.revokedAt
                              ? "Revoked"
                              : i.expiresAt < Date.now() / 1000
                                ? "Expired"
                                : `Expires ${new Date(i.expiresAt * 1000).toLocaleDateString("en-GB")}`}
                        </span>
                      </div>
                      {!i.usedAt &&
                        !i.revokedAt &&
                        i.expiresAt > Date.now() / 1000 && (
                          <Button
                            variant="ghost"
                            busy={busy}
                            onClick={() =>
                              void run(async () => {
                                if (
                                  !(await confirm({
                                    title: `Revoke invitation for ${i.label}?`,
                                    description:
                                      "This link will no longer let someone join. Existing memberships are unaffected.",
                                    action: "Revoke invitation",
                                    danger: true,
                                  }))
                                )
                                  return;
                                await remove(`/invites/${i.id}`);
                              }, "Invitation updated.")
                            }
                          >
                            Revoke
                          </Button>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : tab === "members" ? (
            members.isLoading ? (
              <Loading />
            ) : members.error ? (
              <ErrorState
                error={members.error}
                retry={() => void members.refetch()}
              />
            ) : (
              <div className="admin-rows">
                {members.data?.map((u) => (
                  <div key={u.id}>
                    <div>
                      <strong>{u.name || "Unnamed identity"}</strong>
                      <code>
                        {u.id.slice(0, 8)}…{u.id.slice(-4)}
                      </code>
                    </div>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          aria-label={`Role for ${u.name || u.id}`}
                        >
                          {u.role === "admin"
                            ? "Administrator"
                            : u.role === "member"
                              ? "Member"
                              : "No access"}
                          <ChevronDown size={16} />
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          className="menu-content"
                          align="end"
                          sideOffset={6}
                        >
                          {(["member", "admin", "follower"] as const)
                            .filter((role) => role !== u.role)
                            .map((role) => (
                              <DropdownMenu.Item
                                key={role}
                                className={`menu-item ${role === "follower" ? "danger-text" : ""}`}
                                onSelect={() =>
                                  void run(async () => {
                                    if (
                                      !(await confirm({
                                        title:
                                          role === "follower"
                                            ? `Revoke ${u.name || "this member"}’s access?`
                                            : role === "admin"
                                              ? `Make ${u.name || "this member"} an administrator?`
                                              : `Set ${u.name || "this member"} as a member?`,
                                        description:
                                          role === "follower"
                                            ? hubEnabled ? "They will lose access to future encrypted group updates after synchronization. Previously received data cannot be erased." : "Sessions, alerts and office presence end immediately. Any door claim is released."
                                            : role === "admin"
                                              ? "They will be able to manage members, invitations and resources."
                                              : "Administrator privileges will be removed. The last administrator cannot be removed.",
                                        action:
                                          role === "follower"
                                            ? "Revoke access"
                                            : "Change role",
                                        danger: role === "follower",
                                      }))
                                    )
                                      return;
                                    await put(`/admin/members/${u.id}`, {
                                      role,
                                    });
                                  }, "Member access updated.")
                                }
                              >
                                {role === "admin"
                                  ? "Make administrator"
                                  : role === "member"
                                    ? "Set as member"
                                    : "Revoke access"}
                              </DropdownMenu.Item>
                            ))}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditor("new")}>
                <Plus size={18} />
                Add resource
              </Button>
              {resources.isLoading ? (
                <Loading />
              ) : resources.error ? (
                <ErrorState
                  error={resources.error}
                  retry={() => void resources.refetch()}
                />
              ) : (
                <div className="admin-rows">
                  {resources.data?.map((r) => (
                    <div key={r.id}>
                      <div>
                        <strong>{r.title}</strong>
                        <span className="small muted">
                          {r.type} · {r.status}
                        </span>
                      </div>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            className="icon-button"
                            aria-label={`More actions for ${r.title}`}
                          >
                            <MoreHorizontal size={20} />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            className="menu-content"
                            align="end"
                            sideOffset={6}
                          >
                            <DropdownMenu.Item
                              className="menu-item"
                              onSelect={() => setEditor(r)}
                            >
                              Edit resource
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="menu-item"
                              onSelect={() =>
                                void run(async () => {
                                  const archived = r.status === "active";
                                  if (
                                    !(await confirm({
                                      title: `${archived ? "Archive" : "Restore"} “${r.title}”?`,
                                      description: archived
                                        ? "Members will no longer see it in the catalogue. You can restore it later."
                                        : "This resource will become visible to members again.",
                                      action: archived
                                        ? "Archive resource"
                                        : "Restore resource",
                                    }))
                                  )
                                    return;
                                  await put(`/resources/${r.id}`, {
                                    title: r.title,
                                    description: r.description,
                                    type: r.type,
                                    category: r.category,
                                    url: r.url,
                                    status: archived ? "archived" : "active",
                                  });
                                }, "Resource updated.")
                              }
                            >
                              {r.status === "active"
                                ? "Archive resource"
                                : "Restore resource"}
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Tabs.Content>
      </Tabs.Root>
      {editor && (
        <Modal
          title={editor === "new" ? "Add resource" : "Edit resource"}
          onClose={() => setEditor(null)}
        >
          <AsyncForm
            submitLabel={editor === "new" ? "Add resource" : "Save resource"}
            onSubmit={async (data) => {
              const body = {
                title: data.get("title"),
                description: data.get("description"),
                type: data.get("type"),
                category: data.get("category"),
                url: data.get("url"),
                status: data.get("status"),
              };
              if (editor === "new") await post("/resources", body);
              else await put(`/resources/${editor.id}`, body);
              await client.invalidateQueries({ queryKey: ["resources"] });
              setEditor(null);
              toast("Resource saved.");
            }}
          >
            <Field label="Title">
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={editor === "new" ? "" : editor.title}
              />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={3}
                maxLength={2000}
                defaultValue={editor === "new" ? "" : editor.description}
              />
            </Field>
            <Field label="Type">
              <select
                name="type"
                defaultValue={editor === "new" ? "resource" : editor.type}
              >
                <option value="tool">Tool</option>
                <option value="resource">Resource</option>
              </select>
            </Field>
            <Field label="Category">
              <input
                name="category"
                required
                maxLength={60}
                defaultValue={editor === "new" ? "" : editor.category}
              />
            </Field>
            <Field label="Link">
              <input
                name="url"
                type="url"
                pattern="https?://.*"
                required
                defaultValue={editor === "new" ? "" : editor.url}
              />
            </Field>
            <Field label="Status">
              <select
                name="status"
                defaultValue={editor === "new" ? "active" : editor.status}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </AsyncForm>
        </Modal>
      )}
    </section>
  );
}
