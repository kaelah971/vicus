import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink, DataState, EmptyState, StatusPill } from "@/components/vicus";
import { Chip, GlowField, SectionHead } from "@/components/vicus-ui";
import { BrandMark } from "@/components/brand-mark";
import { isDatabaseUnavailableError } from "@/db";
import { BasketsError, resolveBasket, type ResolvedBasket } from "@/lib/baskets/service";
import { resolveMyBasket } from "@/lib/baskets/user";
import { isBasketWatched } from "@/lib/baskets/watch";
import { getCurrentSession } from "@/lib/auth/session";
import { BasketWatchButton } from "@/components/basket-watch-button";
import { DISCOVERY_ONLY_DISCLOSURE, weightPercent } from "@/lib/baskets/config";

export const dynamic = "force-dynamic";

/** Display host for a source URL; the href stays the exact official URL. */
function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type RouteProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const basket = await resolveBasket(slug);
    return {
      title: `${basket.def.name} — Vicus basket`,
      description: basket.def.theme,
    };
  } catch {
    return { title: "Basket not found" };
  }
}

export default async function BasketDetailPage({ params }: RouteProps) {
  const { slug } = await params;
  let basket: ResolvedBasket | null = null;
  let unavailable = false;
  let kind: "curated" | "user" = "curated";
  let watched = false;
  let userId: string | null = null;
  try {
    userId = (await getCurrentSession())?.user.id ?? null;
  } catch {
    userId = null;
  }
  try {
    basket = await resolveBasket(slug);
  } catch (error) {
    if (error instanceof BasketsError && error.code === "not-found" && userId) {
      // Fall through to the owner's personal basket before giving up.
      try {
        basket = await resolveMyBasket(userId, slug);
        kind = "user";
      } catch (inner) {
        if (inner instanceof BasketsError && inner.code === "not-found") notFound();
        if (isDatabaseUnavailableError(inner)) {
          unavailable = true;
        } else {
          throw inner;
        }
      }
    } else if (error instanceof BasketsError && error.code === "not-found") {
      notFound();
    } else if (isDatabaseUnavailableError(error)) {
      unavailable = true;
    } else {
      throw error;
    }
  }
  if (basket && userId && !unavailable) {
    watched = await isBasketWatched(userId, kind, kind === "curated" ? slug : basket.def.slug).catch(() => false);
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className="v-page-head">
          <GlowField tones={["violet", "blue"]} />
          <div className="shell">
            <span className="v-eyebrow">{kind === "user" ? "Your basket · Discovery only" : "Basket · Discovery only"}</span>
            <h1>{basket?.def.name ?? "Baskets"}</h1>
            <p>{basket?.def.theme ?? "Themed sets of real tokenized assets."}</p>
          </div>
        </header>

        <div className="shell">
          {unavailable || !basket ? (
            <section className="directory-section">
              <DataState title="Basket data is unavailable">
                The database could not provide this basket right now. No fixture fallback is shown.
              </DataState>
            </section>
          ) : (
            <div className="stack">
              <section className="content-panel" aria-label="Discovery disclosure">
                <StatusPill tone="violet">Not investable</StatusPill>
                <p className="control-note" style={{ marginTop: 12 }}>
                  {DISCOVERY_ONLY_DISCLOSURE}
                </p>
                <p className="control-note">Rationale{basket && kind === "user" ? " (author's words, not Vicus-verified)" : ""}: {basket.def.rationale}</p>
                <div className="pos-actions" style={{ marginTop: 12 }}>
                  {kind === "user" ? <Chip tone="violet">Yours</Chip> : null}
                  {userId ? (
                    <BasketWatchButton
                      basketKind={kind}
                      basketRef={kind === "curated" ? slug : basket.def.slug}
                      initialWatched={watched}
                    />
                  ) : (
                    <Link className="button button-outline button-small" href="/profile/me">
                      Sign in to watch
                    </Link>
                  )}
                </div>
              </section>

              <section className="pos-section" aria-label="Basket composition">
                <SectionHead
                  eyebrow={`Composition · v${basket.def.version}`}
                  title={`${basket.members.length} constituents`}
                  line={`Illustrative weights totaling ${weightPercent(basket.members.reduce((sum, m) => sum + m.weightBps, 0))} across ${basket.members.length} of ${basket.def.constituents.length}. Each member keeps its own live eligibility — membership implies nothing.`}
                  action={
                    basket.complete ? (
                      <StatusPill tone="green">Complete</StatusPill>
                    ) : (
                      <StatusPill tone="muted">Partial</StatusPill>
                    )
                  }
                />
                {basket.members.length > 0 ? (
                  <div className="bsk-grid">
                    {basket.members.map((member) => (
                      <article className="bsk-card" key={member.slug}>
                        <div className="bsk-top">
                          <BrandMark slug={member.slug} code={member.code} label={`${member.code} logo`} />
                          <div className="bsk-id">
                            <strong className="bsk-code">{member.code}</strong>
                            <span className="bsk-sub">
                              {member.issuer} · {member.network}
                            </span>
                          </div>
                          <span className="bsk-weight" title="Illustrative basket weight">
                            {member.weightLabel}
                          </span>
                        </div>
                        <div className="bsk-tags">
                          <Chip tone="blue">{member.assetClassLabel}</Chip>
                          <span className="bsk-state">{member.stateLabel}</span>
                        </div>
                        <details className="bsk-elig">
                          <summary>Eligibility</summary>
                          <p>{member.eligibilityNote}</p>
                        </details>
                        <p className="bsk-routes">
                          {member.routes.length > 0
                            ? `Verified routes: ${member.routes.join(" · ")}`
                            : "No execution routes — discovery only."}
                        </p>
                        <div className="bsk-foot">
                          {member.sourceUrl ? (
                            <a href={member.sourceUrl} target="_blank" rel="noreferrer" className="bsk-src-link">
                              Official source →
                            </a>
                          ) : null}
                          <ButtonLink className="button-small" href={member.openHref} variant="outline">
                            Open {member.code}
                          </ButtonLink>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No constituents resolved">
                    None of this basket&apos;s members are in the asset registry right now.
                  </EmptyState>
                )}
                {basket.unresolved.length > 0 ? (
                  <p className="field-help pos-note" role="status">
                    Unresolved:{" "}
                    {basket.unresolved.map((entry) => `${entry.slug} (${entry.reason})`).join(" · ")}
                  </p>
                ) : null}
              </section>

              <section className="content-panel bsk-src" aria-label="Basket provenance">
                <span className="v-eyebrow">Source</span>
                <a className="bsk-src-url" href={basket.def.sourceUrl} target="_blank" rel="noreferrer">
                  {sourceDomain(basket.def.sourceUrl)}
                </a>
                <div className="bsk-nav">
                  <Link className="button button-outline button-small" href="/baskets">
                    All baskets
                  </Link>
                  <Link className="button button-outline button-small" href="/discover">
                    Discover assets
                  </Link>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
