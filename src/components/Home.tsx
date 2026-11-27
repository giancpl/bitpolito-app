import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useIdentity } from "../lib/identity";
import { useResources } from "../lib/queries";
import { modules } from "../modules/registry";
import { Button } from "./ui";

/**
 * Platform Home dashboard.
 * Renders the user greeting, each registered module's live HomeWidget,
 * and quick-launch tiles combining first-party modules and active team tools.
 */
export function HomePage() {
  const { user } = useIdentity();
  const resources = useResources(true);
  if (!user) return null;

  const catalogueLimit = Math.max(0, 4 - modules.length);
  const catalogueTools =
    resources.data?.filter((r) => r.status === "active").slice(0, catalogueLimit) ?? [];

  return (
    <div className="office-page team-home">
      <div className="home-heading">
        <div>
          <p className="eyebrow">Your team, together</p>
          <h1 tabIndex={-1}>Hi, {user.name || "teammate"}.</h1>
        </div>
        <span className="brand-badge" aria-hidden="true">
          <img src="/brand/cow-icon-blue.svg" alt="" />
        </span>
      </div>

      {modules.map((mod) => (mod.HomeWidget ? <mod.HomeWidget key={mod.id} /> : null))}

      <section className="home-tools">
        <div className="section-heading">
          <h2>Your tools</h2>
          <Link to="/resources" className="text-button">
            View all
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="quick-tool-grid">
          {modules.map((mod) => (
            <Link className="quick-tool" key={mod.id} to={mod.route}>
              <span className="quick-tool-icon" aria-hidden="true">
                <img src={`/brand/${mod.icon}`} alt="" />
              </span>
              <strong>{mod.title}</strong>
              <span>{mod.subtitle}</span>
            </Link>
          ))}
          {catalogueTools.map((r) => (
            <a className="quick-tool" key={r.id} href={r.url} target="_blank" rel="noreferrer">
              <span className="quick-tool-icon" aria-hidden="true">
                <img src={`/brand/${r.icon}`} alt="" />
              </span>
              <strong>{r.title}</strong>
              <span>{r.category}</span>
            </a>
          ))}
        </div>
        {resources.isError && (
          <Button variant="ghost" onClick={() => void resources.refetch()}>
            Retry tools
          </Button>
        )}
      </section>
    </div>
  );
}
