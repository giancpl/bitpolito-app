import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { team } from "../lib/hub";
import { keys } from "../lib/queries";
import { useConfirm } from "./Feedback";
import { AsyncForm, Field, FieldError, Notice } from "./ui";

const validRelay = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "wss:" ||
      (url.protocol === "ws:" && ["127.0.0.1", "localhost"].includes(url.hostname))
    );
  } catch {
    return false;
  }
};

export function RelaySettings() {
  const query = useQuery({ queryKey: keys.relays, queryFn: team.relays }),
    confirm = useConfirm(),
    client = useQueryClient();
  const [saved, setSaved] = useState(false);
  return (
    <details className="account-card advanced-settings">
      <summary>Team relay connections</summary>
      <p className="small muted">
        Relays carry encrypted updates. Add new endpoints before retiring the old ones.
      </p>
      {query.data && (
        <AsyncForm
          submitLabel="Update team relays"
          onSubmit={async (form) => {
            const relays = String(form.get("relays")).split(/\s+/).filter(Boolean);
            const invalid = relays.filter((r) => !validRelay(r));
            if (!relays.length || invalid.length)
              throw new FieldError({
                relays: invalid.length
                  ? `Use secure wss:// addresses: ${invalid.join(", ")}`
                  : "Add at least one relay.",
              });
            const ok = await confirm({
              title: "Update relay connections?",
              description:
                "Current members will learn these endpoints when they synchronize. Keep an existing endpoint during migration.",
              action: "Publish relay update",
            });
            if (!ok) return;
            await team.setRelays(relays);
            await client.invalidateQueries();
            setSaved(true);
          }}
        >
          <Field label="Relay URLs — one per line">
            <textarea
              name="relays"
              required
              rows={4}
              defaultValue={query.data.relays.join("\n")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
        </AsyncForm>
      )}
      {query.error && <Notice>{query.error.message}</Notice>}
      {saved && (
        <p role="status" className="small muted">
          Relay update published. Phones pick it up when they next synchronize.
        </p>
      )}
    </details>
  );
}
