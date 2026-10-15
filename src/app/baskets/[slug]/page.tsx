import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink, DataState, EmptyState, StatusPill } from "@/components/vicus";
import { AssetToken, Chip, GlowField, SectionHead } from "@/components/vicus-ui";
import { isDatabaseUnavailableError } from "@/db";
import { BasketsError, resolveBasket, type ResolvedBasket } from "@/lib/baskets/service";
import { resolveMyBasket } from "@/lib/baskets/user";
import { isBasketWatched } from "@/lib/baskets/watch";
import { getCurrentSession } from "@/lib/auth/session";
import { BasketWatchButton } from "@/components/basket-watch-button";
import { DISCOVERY_ONLY_DISCLOSURE } from "@/lib/baskets/config";

export const dynamic = "force-dynamic";

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
                <p className="control-note">Rationale: {basket.def.rationale}</p>
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
                  line="Illustrative weights. Each member keeps its own live eligibility — membership implies nothing."
                  action={
                    basket.complete ? (
                      <StatusPill tone="green">Complete</StatusPill>
                    ) : (
                      <StatusPill tone="muted">Partial</StatusPill>
                    )
                  }
                />
                {basket.members.length > 0 ? (
                  <div className="pos-hold-grid">
                    {basket.members.map((member) => (
                      <article className="pos-hold" key={member.slug}>
                        <div className="pos-hold-top">
                          <AssetToken code={member.code} ecosystem={member.ecosystem} />
                          <div className="pos-hold-id">
                            <strong className="pos-hold-code">{member.code}</strong>
                            <span className="pos-hold-net">
                              {member.network} · {member.weightLabel}
                            </span>
                          </div>
                          <span className="pos-hold-chip">
                            <Chip tone="blue">{member.assetClassLabel}</Chip>
                          </span>
                        </div>
                        <p className="pos-actions-line">
                          {member.issuer} · {member.ecosystemLabel}
                        </p>
                        <p className="pos-issuer" title={member.eligibilityNote}>
                          {member.eligibilityNote}
                        </p>
                        <p className="pos-actions-line">{member.stateLabel}</p>
                        <div className="pos-actions">
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

              <section className="content-panel" aria-label="Basket provenance">
                <p className="control-note">
                  Source:{" "}
                  <a href={basket.def.sourceUrl} target="_blank" rel="noreferrer">
                    {basket.def.sourceUrl}
                  </a>
                </p>
                <p style={{ marginTop: 12 }}>
                  <Link className="button button-outline button-small" href="/baskets">
                    All baskets
                  </Link>{" "}
                  <Link className="button button-outline button-small" href="/discover">
                    Discover assets
                  </Link>
                </p>
              </section>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
