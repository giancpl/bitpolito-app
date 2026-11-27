import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resourceSchema } from "../../shared/contracts";
import { team, type ResourceInput } from "../lib/hub";
import { keys } from "../lib/queries";
import { Button, Notice } from "./ui";
import { useConfirm } from "./Feedback";

const MAX_BYTES = 500_000,
  MAX_ROWS = 500;

async function readArchive(file: File): Promise<ResourceInput[]> {
  if (file.size > MAX_BYTES) throw Error("Choose an archive smaller than 500 KB.");
  const archive = JSON.parse(await file.text());
  if (
    archive.format !== "bitpolito.resources.v1" ||
    !Array.isArray(archive.resources) ||
    archive.resources.length > MAX_ROWS
  )
    throw Error("Choose a BitPolito resource export.");
  return archive.resources.map((row: Record<string, unknown>) => {
    const { id, icon, ...fields } = row;
    return {
      ...resourceSchema.parse(fields),
      id: String(id),
      icon: typeof icon === "string" && /^[a-z0-9-]+\.svg$/.test(icon) ? icon : "icon-linkedin.svg",
    };
  });
}

export function ResourceImport() {
  const [rows, setRows] = useState<ResourceInput[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(0);
  const confirm = useConfirm(),
    client = useQueryClient();

  async function publish() {
    const ok = await confirm({
      title: `Publish ${rows.length} resources?`,
      description:
        "The current members of your encrypted team will receive this catalogue. Matching resource IDs will be updated.",
      action: "Publish catalogue",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    setDone(0);
    try {
      for (const row of rows) {
        await team.saveResource(row);
        setDone((n) => n + 1);
      }
      setRows([]);
      await client.invalidateQueries({ queryKey: keys.resources });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="resource-import">
      <summary>Import an existing catalogue</summary>
      <p className="small muted">
        Choose a BitPolito resource export. Nothing is published until you confirm.
      </p>
      <input
        aria-label="Resource archive"
        type="file"
        accept="application/json,.json"
        onChange={(event) =>
          void (async () => {
            try {
              setError("");
              const file = event.target.files?.[0];
              if (file) setRows(await readArchive(file));
            } catch (e) {
              setError((e as Error).message);
            }
          })()
        }
      />
      {rows.length > 0 && (
        <>
          <ul className="small">
            {rows.map((r) => (
              <li key={r.id}>
                {r.title} · {r.status}
              </li>
            ))}
          </ul>
          <Button busy={busy} onClick={() => void publish()}>
            {busy ? `Publishing ${done}/${rows.length}…` : "Publish catalogue"}
          </Button>
        </>
      )}
      {error && <Notice>{error}</Notice>}
    </details>
  );
}
