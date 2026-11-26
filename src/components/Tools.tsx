import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Empty, ErrorState, ExpandableText, ExternalLink, Loading } from "./ui";
import type { Resource } from "../../shared/contracts";
export function ResourcesPage() {
  const query = useQuery({
    queryKey: ["resources"],
    queryFn: () => api<Resource[]>("/resources"),
  });
  return (
    <>
      <div className="page-intro">
        <div>
          <h1>
            Tools<span>.</span>
          </h1>
          <p>Your BitPolito toolkit.</p>
        </div>
      </div>
      <Link className="tool-office-link" to="/office"><img src="/brand/icon-bell.svg" alt=""/><span><strong>Office</strong><small>Presence & doorbell</small></span><span aria-hidden="true">→</span></Link>
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        ["tool", "resource"].map((type) => {
          const items =
            query.data?.filter(
              (r) => r.type === type && r.status === "active",
            ) || [];
          return (
            <section className="resource-section" key={type}>
              <div className="section-heading">
                <h2>{type === "tool" ? "Tools" : "Resources"}</h2>
                <span className="pill">{items.length}</span>
              </div>
              {items.length ? (
                <div className="resource-grid">
                  {items.map((item) => (
                    <article className="resource-card" key={item.id}>
                      <div className="resource-icon">
                        <img src={`/brand/${item.icon}`} alt="" />
                      </div>
                      <span className="small muted">{item.category}</span>
                      <h3>{item.title}</h3>
                      <ExpandableText text={item.description} />
                      <ExternalLink href={item.url} className="text-button">
                        {type === "tool" ? "Open tool" : "Open resource"}
                      </ExternalLink>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title={
                    type === "tool"
                      ? "More tools are on the way."
                      : "A little room for good resources."
                  }
                >
                  The team will add useful links here.
                </Empty>
              )}
            </section>
          );
        })
      )}
    </>
  );
}

export { OfficePage as HomePage } from "./Moo";
