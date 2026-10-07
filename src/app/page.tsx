import Link from "next/link";
import {
  AssetPassport,
  MarketingShell,
  ButtonLink,
  CircleCard,
  DataState,
  EmptyState,
  Eyebrow,
  Icon,
  MissionCard,
  PortalVisual,
  RewardState,
} from "@/components/vicus";
import { isDatabaseUnavailableError } from "@/db";
import { listCircles } from "@/lib/data/circles";
import { listMissions } from "@/lib/data/missions";

export const dynamic = "force-dynamic";

export default async function Home() {
  let featuredCircles = [] as Awaited<ReturnType<typeof listCircles>>;
  let featuredMissions = [] as Awaited<ReturnType<typeof listMissions>>;
  let databaseUnavailable = false;

  try {
    [featuredCircles, featuredMissions] = await Promise.all([listCircles(), listMissions()]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  const featuredCircle = featuredCircles[0];
  const featuredMission = featuredMissions[0];
  return (
    <MarketingShell>
      <main>
        <section className="hero">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <span className="eyebrow hero-eyebrow">THE COMMUNITY LAYER FOR TOKENIZED ASSETS</span>
              <h1 className="hero-title">Tokenized assets need a place to belong.</h1>
              <p className="hero-support">
                Vicus turns Stellar assets into living communities where people can learn what they
                represent, watch before connecting a wallet, prove relevant participation, contribute
                useful knowledge, and claim eligible rewards.
              </p>
              <div className="hero-actions">
                <ButtonLink href="/discover" variant="white">
                  Explore Vicus <Icon name="arrow-right" size={16} />
                </ButtonLink>
                <ButtonLink href="#verification" variant="outline">
                  See how verification works
                </ButtonLink>
              </div>
              <p className="trust-line">
                Educational and community product. Not financial advice. Asset access and reward
                eligibility vary by issuer and region.
              </p>
            </div>
            <div className="hero-visual">
              <PortalVisual label="Asset · portal · participation" />
            </div>
          </div>
        </section>

        <section className="home-section" id="explore-first">
          <div className="shell home-section-grid">
            <div className="home-section-copy">
              <Eyebrow>Explore first</Eyebrow>
              <h2>Look around before you connect anything.</h2>
              <p>
                Browse asset circles, read the Passport, and understand what each community is for
                before deciding whether to verify a role.
              </p>
              <Link className="home-section-link" href="/discover">
                Browse all circles <Icon name="arrow-right" size={16} />
              </Link>
            </div>
            <div className="section-visual-stack">
              {databaseUnavailable ? (
                <DataState title="Circle data is unavailable">
                  The database could not provide the discovery preview. No fixture fallback is being shown.
                </DataState>
              ) : featuredCircles.length > 0 ? (
                <>
                  <div className="explore-preview-grid">
                    {featuredCircles.slice(0, 2).map((circle) => (
                      <CircleCard circle={circle} key={circle.slug} />
                    ))}
                  </div>
                  <p className="section-note">
                    Watch mode is a low-friction entry point. These database records remain source-review fixtures.
                  </p>
                </>
              ) : (
                <EmptyState title="No circles yet">
                  The database has no circle records to show. No fixture fallback is being shown.
                </EmptyState>
              )}
            </div>
          </div>
        </section>

        <section className="home-section" id="know-the-asset">
          <div className="shell home-section-grid">
            <div className="home-section-copy">
              <Eyebrow>Know the asset</Eyebrow>
              <h2>Context before action.</h2>
              <p>
                Every Passport explains what the asset represents, who or what the source is, which
                restrictions apply, and which actions Vicus supports.
              </p>
              <Link className="home-section-link" href="/circles/usdc-on-stellar#passport">
                Read a Passport <Icon name="arrow-right" size={16} />
              </Link>
            </div>
            <div className="passport-spotlight">
              {featuredCircle ? (
                <AssetPassport circle={featuredCircle} compact />
              ) : (
                <DataState title="Passport data is unavailable">
                  A database-backed circle is required before a Passport can be shown.
                </DataState>
              )}
            </div>
          </div>
        </section>

        <section className="home-section" id="verification">
          <div className="shell home-section-grid">
            <div className="home-section-copy">
              <Eyebrow>Prove your role</Eyebrow>
              <h2>Show the role that matters.</h2>
              <p>
                Verification should establish only the role or eligibility needed for an action.
                Public profiles can show a role without turning an exact balance into a public
                balance sheet.
              </p>
              <span className="section-note">
                Read-only Stellar checks are available on configured circles; connect only when you choose a verified action.
              </span>
            </div>
            <div className="role-preview">
              <div className="role-card">
                <div className="role-card-header">
                  <Eyebrow>Role preview</Eyebrow>
                  <span className="status-pill status-muted">Not connected</span>
                </div>
                <h3>Your role can be visible without your balance becoming public.</h3>
                <p>
                  A configured circle can check only the Stellar relationship it requires, then return
                  an explicit result without showing an exact balance.
                </p>
                <div className="role-card-footer">
                  <Icon name="lock" size={15} />
                  The home page runs no lookup; open a configured circle when you are ready.
                </div>
              </div>
              <div className="portal-inline">
                <PortalVisual compact label="Role · proof · privacy" />
              </div>
            </div>
          </div>
        </section>

        <section className="home-section" id="participate">
          <div className="shell home-section-grid">
            <div className="home-section-copy">
              <Eyebrow>Participate</Eyebrow>
              <h2>Make understanding useful.</h2>
              <p>
                Complete proof-based missions, contribute research, and build a record of
                participation that is more meaningful than a click count.
              </p>
              <Link className="home-section-link" href="/missions">
                Explore missions <Icon name="arrow-right" size={16} />
              </Link>
            </div>
            <div className="mission-preview-grid">
              {featuredMission ? (
                <MissionCard mission={featuredMission} />
              ) : (
                <EmptyState title="No mission configured">
                  The database has no missions to show. No fixture mission is displayed.
                </EmptyState>
              )}
              <div className="hairline-card">
                <Eyebrow>Contribution record</Eyebrow>
                <h3 className="panel-title">Useful work should leave proof behind.</h3>
                <p className="panel-copy">
                  Review, revision, and approval states make contribution quality visible without
                  pretending a response has already been accepted.
                </p>
                <div className="mini-rule-list">
                  <span><i /> Evidence required when relevant</span>
                  <span><i /> Review states stay explicit</span>
                  <span><i /> Recognition follows useful work</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="home-section" id="see-what-happened">
          <div className="shell home-section-grid">
            <div className="home-section-copy">
              <Eyebrow>See what happened</Eyebrow>
              <h2>A reward is not complete until the state is clear.</h2>
              <p>
                Eligibility, approval, claim creation, submission, confirmation, and failure are
                different moments. Vicus should show each one rather than compressing uncertainty
                into a success label.
              </p>
              <Link className="home-section-link" href="/profile/me">
                View your profile <Icon name="arrow-right" size={16} />
              </Link>
            </div>
            <div className="reward-preview-grid">
              <RewardState compact />
              <div className="hairline-card receipt-preview">
                <Eyebrow>Receipt language</Eyebrow>
                <h3 className="panel-title">The state is the proof.</h3>
                <div className="receipt-steps">
                  <span><b>01</b> Eligible</span>
                  <span><b>02</b> Approved</span>
                  <span><b>03</b> Submitted</span>
                  <span><b>04</b> Confirmed</span>
                </div>
                <p className="panel-copy">This landing-page preview describes reward states; no reward settlement is implied here.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="home-section" id="for-issuers">
          <div className="shell">
            <div className="issuer-band">
              <div>
                <Eyebrow>For issuers</Eyebrow>
                <h3>Create informed attention around your asset.</h3>
                <p>
                  Launch campaigns, define missions, set eligibility, review contributions, and
                  understand which activities turn watchers into informed participants.
                </p>
              </div>
              <div className="issuer-band-action">
                <ButtonLink href="/admin" variant="outline">
                  Open issuer shell <Icon name="arrow-up-right" size={16} />
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>

        <footer className="shell home-footer">
          Vicus keeps its circle, mission, profile, and campaign content in the database. Stellar
          read-only role checks, wallet-backed sessions, and mission persistence are live; reward
          settlement is not presented as shipped.
        </footer>
      </main>
    </MarketingShell>
  );
}
