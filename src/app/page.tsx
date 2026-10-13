import Link from "next/link";
import { ButtonLink, DataState, Icon, MarketingShell } from "@/components/vicus";
import {
  ASSET_CLASSES,
  ActionTray,
  AssetToken,
  Avatar,
  Chip,
  EcoChip,
  Glyph,
  GlowField,
  MetricTile,
  Orb,
  SectionHead,
  StepFlow,
  capabilityMeta,
  EdgeLight,
  edgeClass,
  type ActionItem,
} from "@/components/vicus-ui";
import { VicusHeroVisual } from "@/components/vicus-hero-visual";
import { VicusFooter } from "@/components/vicus-footer";
import { isDatabaseUnavailableError } from "@/db";
import { isAssetCircle, listCircles } from "@/lib/data/circles";
import { listMissions } from "@/lib/data/missions";
import { getCircleCapabilities, supportModeBadge } from "@/lib/utility/service";
import { getActivationMissionLinks } from "@/lib/activation/service";
import { getOrganizationBySlug, listSpaces } from "@/lib/organizations/service";
import { listCirclePosts } from "@/lib/community/service";
import { getCirclePeople } from "@/lib/social/service";
import { rewardNetworkLabel } from "@/lib/rewards/display";

export const dynamic = "force-dynamic";

async function soft<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

const NO_REWARD = "No reward configured";

export default async function Home() {
  let circles = [] as Awaited<ReturnType<typeof listCircles>>;
  let missions = [] as Awaited<ReturnType<typeof listMissions>>;
  let databaseUnavailable = false;

  try {
    [circles, missions] = await Promise.all([listCircles(), listMissions()]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  const assets = circles.filter(isAssetCircle);
  const featured = assets.find((circle) => circle.slug === "usdc-on-stellar") ?? assets[0] ?? null;
  const sameAsset = featured
    ? assets.filter((circle) => circle.code === featured.code && circle.slug !== featured.slug)
    : [];
  const otherAssets = assets.filter((circle) => circle.slug !== featured?.slug).slice(0, 6);
  const activation = missions.find((mission) => mission.type === "onchain_action") ?? null;
  const spotlightMission = activation ?? missions[0] ?? null;

  const [capabilities, activationLinks, spaces, posts, people] = await Promise.all([
    featured ? soft(() => getCircleCapabilities(featured.slug), []) : Promise.resolve([]),
    featured ? soft(() => getActivationMissionLinks(featured.id), new Map()) : Promise.resolve(new Map()),
    soft(() => listSpaces(), []),
    featured ? soft(() => listCirclePosts(featured.slug, null, null, 6), []) : Promise.resolve([]),
    featured ? soft(() => getCirclePeople(featured.id), []) : Promise.resolve([]),
  ]);
  const rankedSpaces = [...spaces].sort(
    (a, b) =>
      b.hostedCircleCount + b.openMissionCount + b.publishedLessonCount -
      (a.hostedCircleCount + a.openMissionCount + a.publishedLessonCount),
  );
  const featuredSpace = rankedSpaces[0] ?? null;
  const featuredSpaceDetail = featuredSpace ? await soft(() => getOrganizationBySlug(featuredSpace.slug), null) : null;
  const rewardNetwork = rewardNetworkLabel();

  const workActions: ActionItem[] = capabilities.map((capability) => {
    const meta = capabilityMeta(capability.capabilityType);
    return {
      key: capability.id,
      label: capability.title,
      href: `/circles/${capability.circleSlug}/use/${capability.capabilityType}`,
      tone: meta.tone,
      icon: meta.icon,
      state: activationLinks.has(capability.capabilityType) ? "Mission available" : supportModeBadge[capability.supportMode],
      live: activationLinks.has(capability.capabilityType),
    };
  });

  return (
    <MarketingShell>
      <main className="landing">
        {/* 1 — Hero */}
        <section className="hero">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <span className="eyebrow hero-eyebrow">STELLAR IS HOME FOR TOKENIZED ASSETS</span>
              <h1 className="hero-title">Tokenized assets need a place to belong.</h1>
              <p className="hero-support">Start on Stellar. Discover real tokenized assets, compare representations, use what you hold.</p>
              <div className="hero-actions">
                <ButtonLink href="/discover" variant="white">
                  Explore Vicus <Icon name="arrow-right" size={16} />
                </ButtonLink>
                <ButtonLink href="/use" variant="glass">
                  Put assets to work
                </ButtonLink>
              </div>
              <p className="trust-line">
                Educational product. Not financial advice.
              </p>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <VicusHeroVisual />
            </div>
          </div>
        </section>

        {/* 2 — Discover tokenized assets */}
        <section className="l-section l-discover" id="discover">
          <div className="shell">
            <SectionHead
              action={
                <ButtonLink href="/discover" variant="glass">
                  Explore assets <Icon name="arrow-right" size={16} />
                </ButtonLink>
              }
              eyebrow="Discover · Start on Stellar"
              line="Real Stellar tokenized assets first — connected ecosystems extend below."
              title="Every asset, one place to start."
            />
            {databaseUnavailable ? (
              <DataState title="Asset data is unavailable">The database could not provide assets right now.</DataState>
            ) : featured ? (
              <div className="l-discover-stage">
                <Link className="l-feature-asset" href={`/circles/${featured.slug}`}>
                  <GlowField tones={["blue", "violet"]} />
                  <div className="l-feature-token">
                    <AssetToken code={featured.code} ecosystem={featured.ecosystem} ecosystemLabel={featured.ecosystemLabel} size="xl" />
                  </div>
                  <div className="l-feature-copy">
                    <Chip icon="coins" tone="blue">{featured.assetClassLabel ?? featured.category}</Chip>
                    <h3>{featured.name}</h3>
                    {sameAsset.length > 0 ? (
                      <div className="l-feature-ecos">
                        <span>Also on</span>
                        {sameAsset.map((circle) => (
                          <EcoChip ecosystem={circle.ecosystem} key={circle.slug} label={circle.ecosystemLabel} />
                        ))}
                      </div>
                    ) : null}
                    <span className="l-link">
                      Open asset <Icon name="arrow-right" size={15} />
                    </span>
                  </div>
                </Link>
                <div className="l-asset-cloud">
                  {otherAssets.map((circle, index) => (
                    <Link className="l-asset-chip" href={`/circles/${circle.slug}`} key={circle.slug} style={{ animationDelay: `${index * -1.3}s` }}>
                      <AssetToken code={circle.code} ecosystem={circle.ecosystem} ecosystemLabel={circle.ecosystemLabel} size="sm" />
                      <span>
                        <strong>{circle.code}</strong>
                        <small>{circle.ecosystemLabel}</small>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="l-class-rail" aria-label="Asset classes">
              {ASSET_CLASSES.filter((entry) => entry.value !== "other_financial").map((entry) => {
                const count = assets.filter((circle) => circle.category === entry.value).length;
                return (
                  <Link className={`l-class tone-${entry.tone}`} href={`/discover?class=${entry.value}`} key={entry.value}>
                    <Orb icon={entry.icon} size="md" tone={entry.tone} />
                    <strong>{entry.short}</strong>
                    <small>{count > 0 ? `${count} ${count === 1 ? "asset" : "assets"}` : "Not listed yet"}</small>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3 — Discover → Understand → Use → Participate → Earn */}
        <section className="l-section l-flow" id="how-it-works">
          <div className="shell">
            <SectionHead center eyebrow="How Vicus works" title="From first look to first reward." />
            <StepFlow
              label="The Vicus loop"
              steps={[
                { icon: "compass", label: "Discover", line: "Find real assets", tone: "blue" },
                { icon: "book", label: "Understand", line: "Read the Passport", tone: "violet" },
                { icon: "bolt", label: "Put it to work", line: "Use it for real", tone: "green" },
                { icon: "users", label: "Participate", line: "Missions & community", tone: "pink" },
                { icon: "gift", label: "Earn", line: "Points & XLM rewards", tone: "white" },
              ]}
            />
          </div>
        </section>

        {/* 4 — Put assets to work */}
        {featured && workActions.length > 0 ? (
          <section className="l-section l-work">
            <div className="shell l-work-grid">
              <div className="l-work-copy">
                <SectionHead
                  eyebrow="Put assets to work"
                  line="Every action opens the official flow or a guide. Vicus never moves funds."
                  title="Real actions. Not just reading."
                />
                <ButtonLink href={`/circles/${featured.slug}#use`} variant="white">
                  See how {featured.code} works <Icon name="arrow-right" size={16} />
                </ButtonLink>
              </div>
              <div className="l-work-stage">
                <GlowField tones={["blue", "green", "violet"]} />
                <div className={`l-wallet ${edgeClass("live")}`}>
                  <EdgeLight />
                  <div className="l-wallet-head">
                    <AssetToken code={featured.code} ecosystem={featured.ecosystem} ecosystemLabel={featured.ecosystemLabel} size="lg" />
                    <span>
                      <strong>{featured.code}</strong>
                      <small>{featured.ecosystemLabel} · {featured.assetClassLabel ?? featured.category}</small>
                    </span>
                    <Chip>{featured.stateLabel}</Chip>
                  </div>
                  <ActionTray actions={workActions} layout="stack" />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* 5 — Project Spaces */}
        <section className="l-section l-spaces">
          <div className="shell">
            <SectionHead
              action={
                <div className="v-button-row">
                  <ButtonLink href="/spaces" variant="glass">Explore Spaces</ButtonLink>
                  <ButtonLink href="/host" variant="outline">Host on Vicus</ButtonLink>
                </div>
              }
              eyebrow="Project Spaces"
              line="Projects host their assets, lessons, and missions in one home."
              title="Storefronts for tokenized projects."
            />
            {featuredSpace ? (
              <div className="l-spaces-grid">
                <Link className={`space-feature ${edgeClass("slow")}`} href={`/spaces/${featuredSpace.slug}`}>
                  <EdgeLight />
                  <span aria-hidden="true" className="space-feature-banner">
                    <GlowField tones={["violet", "pink", "blue"]} />
                  </span>
                  <span className="space-monogram">{featuredSpace.name.slice(0, 1)}</span>
                  <span className="space-feature-body">
                    <strong>{featuredSpace.name}</strong>
                    <small>{featuredSpace.ecosystemFocus ? `${featuredSpace.ecosystemFocus} focus` : "Multi-ecosystem"}</small>
                    <span className="space-feature-line">{featuredSpace.description}</span>
                  </span>
                  <span className="space-feature-metrics">
                    <MetricTile icon="coins" label="Assets" tone="blue" value={String(featuredSpace.hostedCircleCount)} />
                    <MetricTile icon="target" label="Missions" tone="green" value={String(featuredSpace.openMissionCount)} />
                    <MetricTile icon="book" label="Lessons" tone="violet" value={String(featuredSpace.publishedLessonCount)} />
                    <MetricTile icon="chat" label="Contributions" tone="pink" value={String(featuredSpace.approvedContributionCount)} />
                  </span>
                  {featuredSpaceDetail && featuredSpaceDetail.circles.length > 0 ? (
                    <span className="space-feature-assets">
                      {featuredSpaceDetail.circles.slice(0, 5).map((circle) => (
                        <AssetToken code={circle.code} ecosystem={circle.ecosystem} key={circle.slug} size="sm" />
                      ))}
                      <small>Hosted assets</small>
                    </span>
                  ) : null}
                </Link>
                <div className="l-space-side">
                  {rankedSpaces.slice(1, 3).map((space) => (
                    <Link className="space-mini" href={`/spaces/${space.slug}`} key={space.id}>
                      <span className="space-monogram space-monogram-sm">{space.name.slice(0, 1)}</span>
                      <span>
                        <strong>{space.name}</strong>
                        <small>{space.hostedCircleCount} assets · {space.openMissionCount} missions</small>
                      </span>
                      <Icon name="arrow-right" size={15} />
                    </Link>
                  ))}
                  <Link className="space-mini space-mini-host" href="/host">
                    <Orb icon="spark" size="md" tone="white" />
                    <span>
                      <strong>Host your project</strong>
                      <small>Lessons, missions, community</small>
                    </span>
                    <Icon name="arrow-right" size={15} />
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* 6 — Missions / activation */}
        {spotlightMission ? (
          <section className="l-section l-activate">
            <div className="shell l-activate-grid">
              <div className="l-activate-copy">
                <SectionHead
                  eyebrow="Missions"
                  line={activation ? "Do the real thing onchain, prove it, get rewarded." : "Complete a mission, build a record, earn."}
                  title={activation ? "Use it. Prove it. Earn." : "Make understanding useful."}
                />
                <StepFlow
                  label="Activation steps"
                  steps={[
                    { icon: "bolt", label: "Use", line: activation ? `Send ${featured?.code ?? "USDC"}` : "Complete", tone: "green" },
                    { icon: "shield", label: "Prove", line: activation ? "Onchain proof" : "Submit", tone: "blue" },
                    { icon: "gift", label: "Earn", line: `${spotlightMission.points} pts`, tone: "white" },
                  ]}
                  variant="compact"
                />
                <div className="l-activate-facts">
                  {activation ? <Chip icon="globe">Stellar Mainnet</Chip> : null}
                  {activation ? <Chip icon="shield">Onchain proof</Chip> : null}
                  {spotlightMission.reward !== NO_REWARD ? (
                    <Chip icon="gift" tone="white">
                      {spotlightMission.reward}
                      {rewardNetwork ? ` · ${rewardNetwork}` : ""}
                    </Chip>
                  ) : null}
                </div>
                <div className="v-button-row">
                  <ButtonLink href={`/missions/${spotlightMission.id}`} variant="white">
                    {activation ? "Start activation" : "Start mission"} <Icon name="arrow-right" size={16} />
                  </ButtonLink>
                  <ButtonLink href="/missions" variant="glass">All missions</ButtonLink>
                </div>
              </div>
              <div className="l-activate-visual">
                <GlowField tones={["green", "violet"]} />
                <div className="l-activate-proof">
                  <Orb icon="shield" size="lg" tone="green" />
                  <p><strong>{activation ? "Prove it onchain" : "Build a verifiable record"}</strong></p>
                  <p className="muted small">
                    {activation
                      ? "Your transaction is the proof. Vicus verifies it on Stellar Mainnet."
                      : "Approved missions build your contributor record."}
                  </p>
                  <p className="muted small">{spotlightMission.points} points{spotlightMission.reward !== NO_REWARD ? ` · ${spotlightMission.reward}` : ""}</p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* 7 — People / community */}
        <section className="l-section l-community">
          <div className="shell">
            <SectionHead center eyebrow="Community" title="Learn from people, not paragraphs." />
            <div className="l-community-stage">
              <GlowField tones={["pink", "violet"]} />
              {people.length > 0 ? (
                <div className="l-people" aria-label="People in the community">
                  {people.slice(0, 7).map((person) => (
                    <Link className="l-person" href={`/u/${person.user.handle}`} key={person.user.id}>
                      <Avatar name={person.user.displayName || person.user.handle} size="lg" />
                      <small>@{person.user.handle}</small>
                    </Link>
                  ))}
                </div>
              ) : null}
              {posts.length > 0 ? (
                <div className="l-bubbles">
                  {posts.slice(0, 4).map((post, index) => (
                    <Link
                      className={`l-bubble l-bubble-${index % 2 === 0 ? "left" : "right"}`}
                      href={`/circles/${post.circleSlug}/community/${post.id}`}
                      key={post.id}
                    >
                      <span className="l-bubble-head">
                        <Avatar name={post.author.displayName || post.author.handle} size="sm" />
                        <small>@{post.author.handle}</small>
                        <span className={`v-chip tone-${post.type === "question" ? "blue" : post.type === "insight" ? "pink" : "green"}`}>
                          {post.type}
                        </span>
                      </span>
                      <strong>{post.title}</strong>
                      <span className="l-bubble-meta">
                        <span><Glyph name="heart" size={13} /> {post.helpfulCount} helpful</span>
                        <span><Glyph name="chat" size={13} /> {post.answerCount} answers</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="l-community-empty">Questions and insights from members appear here as they are posted.</p>
              )}
            </div>
            <div className="l-center-cta">
              <ButtonLink href="/people" variant="glass">
                Join the community <Icon name="arrow-right" size={16} />
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* 8 — Project value */}
        <section className="l-section l-projects">
          <div className="shell">
            <div className={`l-projects-panel ${edgeClass("slow")}`}>
              <EdgeLight />
              <GlowField tones={["violet", "orange"]} />
              <SectionHead eyebrow="For projects" line="One loop from attention to informed participation." title="Grow a community that understands you." />
              <StepFlow
                label="Project loop"
                steps={[
                  { icon: "home", label: "Host", line: "Your Space", tone: "violet" },
                  { icon: "book", label: "Teach", line: "Lessons", tone: "blue" },
                  { icon: "bolt", label: "Activate", line: "Real use", tone: "green" },
                  { icon: "shield", label: "Verify", line: "Proof", tone: "pink" },
                  { icon: "gift", label: "Reward", line: "XLM & points", tone: "white" },
                  { icon: "trend", label: "Grow", line: "Community", tone: "orange" },
                ]}
              />
              <div className="l-center-cta">
                <ButtonLink href="/discover" variant="glass">
                  Explore Vicus <Icon name="arrow-right" size={16} />
                </ButtonLink>
                <ButtonLink href="/host" variant="white">
                  Host on Vicus <Icon name="arrow-right" size={16} />
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </main>
      <VicusFooter />
    </MarketingShell>
  );
}
