import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { Chip, GlowField, SectionHead } from "@/components/vicus-ui";
import { isDatabaseUnavailableError } from "@/db";
import { DISCOVERY_ONLY_DISCLOSURE, getBasketDef } from "@/lib/baskets/config";
import { listBaskets } from "@/lib/baskets/service";
import { getMyBasket, listMyBaskets } from "@/lib/baskets/user";
import { listWatchedBaskets } from "@/lib/baskets/watch";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Curated baskets",
  description: "Discovery-only themed sets of real tokenized assets. Not investable.",
};

export default async function BasketsPage() {
  let baskets: Awaited<ReturnType<typeof listBaskets>> = [];
  let unavailable = false;
  let userId: string | null = null;
  try {
    baskets = await listBaskets();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      unavailable = true;
    } else {
      throw error;
    }
  }
  try {
    userId = (await getCurrentSession())?.user.id ?? null;
  } catch {
    userId = null;
  }
  type PersonalEntry = { key: string; name: string; detail: string; href: string | null };
  let mine: PersonalEntry[] = [];
  let watched: PersonalEntry[] = [];
  if (userId && !unavailable) {
    try {
      const [myBaskets, watchedRefs] = await Promise.all([
        listMyBaskets(userId).catch(() => []),
        listWatchedBaskets(userId).catch(() => []),
      ]);
      mine = myBaskets.map((basket) => ({
        key: `user:${basket.id}`,
        name: basket.name,
        detail: `${basket.constituents.length} assets · yours`,
        href: `/baskets/${basket.slug}`,
      }));
      watched = (
        await Promise.all(
          watchedRefs.map(async (ref) => {
            if (ref.kind === "curated") {
              const def = getBasketDef(ref.ref);
              if (!def) return null;
              return { key: `curated:${ref.ref}`, name: def.name, detail: "Curated theme", href: `/baskets/${ref.ref}` };
            }
            const own = await getMyBasket(userId, ref.ref).catch(() => null);
            if (!own) {
              return { key: `user:${ref.ref}`, name: "Unavailable basket", detail: "No longer available.", href: null };
            }
            return { key: `user:${own.id}`, name: own.name, detail: `${own.constituents.length} assets · yours`, href: `/baskets/${own.slug}` };
          }),
        )
      ).filter((entry): entry is PersonalEntry => entry !== null);
    } catch {
      mine = [];
      watched = [];
    }
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className="v-page-head">
          <GlowField tones={["violet", "blue"]} />
          <div className="shell">
            <span className="v-eyebrow">Discover · Curated baskets</span>
            <h1>Baskets</h1>
            <p>Themed sets of real tokenized assets, curated for exploration. {DISCOVERY_ONLY_DISCLOSURE}</p>
          </div>
        </header>

        <div className="shell">
          {unavailable ? (
            <section className="directory-section">
              <DataState title="Baskets are unavailable">
                The database could not provide baskets right now. No fixture fallback is shown.
              </DataState>
            </section>
          ) : (
            <section className="directory-section" aria-label="Curated baskets">
              <SectionHead
                eyebrow={`${baskets.length} themes`}
                title="Browse by theme"
                line="Composition is illustrative. Every member links to its full asset page with live eligibility."
              />
              <div className="pos-hold-grid">
                {baskets.map((basket) => (
                  <article className="pos-hold" key={basket.slug}>
                    <div className="pos-hold-top">
                      <div className="pos-hold-id">
                        <strong className="pos-hold-code">{basket.name}</strong>
                        <span className="pos-hold-net">
                          {basket.memberCount} assets · v{basket.version}
                        </span>
                      </div>
                    </div>
                    <p className="pos-actions-line">{basket.theme}</p>
                    <div className="pos-actions">
                      {basket.memberCodes.map((code) => (
                        <Chip key={code} tone="violet">
                          {code}
                        </Chip>
                      ))}
                    </div>
                    <div className="pos-actions">
                      <Link className="button button-outline button-small" href={`/baskets/${basket.slug}`}>
                        Open theme
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {userId && !unavailable ? (
            <section className="directory-section" aria-label="Your baskets">
              <SectionHead
                eyebrow="Yours"
                title="Saved baskets"
                line="Personal discovery themes. Watching tracks a theme — it is not ownership."
                action={
                  <Link className="button button-outline button-small" href="/baskets/new">
                    Create a basket
                  </Link>
                }
              />
              {mine.length === 0 && watched.length === 0 ? (
                <p className="field-help pos-note">
                  Nothing saved yet. Create a basket from real catalogue assets, or watch a curated theme to find it here after reload.
                </p>
              ) : (
                <div className="pos-hold-grid">
                  {mine.map((entry) => (
                    <article className="pos-hold" key={entry.key}>
                      <div className="pos-hold-top">
                        <div className="pos-hold-id">
                          <strong className="pos-hold-code">{entry.name}</strong>
                          <span className="pos-hold-net">{entry.detail}</span>
                        </div>
                      </div>
                      <div className="pos-actions">
                        <Link className="button button-outline button-small" href={entry.href ?? "/baskets"}>
                          Open basket
                        </Link>
                      </div>
                    </article>
                  ))}
                  {watched.map((entry) => (
                    <article className="pos-hold" key={entry.key}>
                      <div className="pos-hold-top">
                        <div className="pos-hold-id">
                          <strong className="pos-hold-code">{entry.name}</strong>
                          <span className="pos-hold-net">Watching · {entry.detail}</span>
                        </div>
                      </div>
                      <div className="pos-actions">
                        {entry.href ? (
                          <Link className="button button-outline button-small" href={entry.href}>
                            Open basket
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          {!userId && !unavailable ? (
            <section className="directory-section" aria-label="Your baskets">
              <SectionHead
                eyebrow="Yours"
                title="Saved baskets"
                line="Sign in to create personal themes and watch baskets across visits."
                action={
                  <Link className="button button-outline button-small" href="/baskets/new">
                    Create a basket
                  </Link>
                }
              />
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
