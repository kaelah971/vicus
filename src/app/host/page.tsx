import type { Metadata } from "next";
import Link from "next/link";
import { DataState, EmptyState, Eyebrow, Icon } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { listEcosystems } from "@/lib/data/circles";
import { listMySpaceApplications, listOrganizationsForActor } from "@/lib/organizations/service";
import { listMyAssetRegistrations } from "@/lib/registrations/service";
import { SpaceOnboardingWizard } from "@/components/space-onboarding-wizard";
import { AssetRegistrationPanel, type RegistrationClaim } from "@/components/asset-registration-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Host on Vicus",
  description: "Apply to host your project's community, lessons, and missions on Vicus.",
};

function statusLabel(status: string) {
  if (status === "draft") return "Draft — not submitted";
  if (status === "pending") return "Pending review";
  if (status === "approved") return "Approved";
  return "Rejected";
}

export default async function HostPage({ searchParams }: { searchParams?: Promise<{ resume?: string }> }) {
  const params = (await searchParams) ?? {};
  const resumeId = typeof params.resume === "string" && /^[0-9a-f-]{36}$/i.test(params.resume) ? params.resume : null;
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="host">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Host data is unavailable">
                The database could not provide this page right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  let ecosystems: Array<{ value: string; label: string }> = [];
  let myOrgs: Awaited<ReturnType<typeof listOrganizationsForActor>> = [];
  let myApplications: Awaited<ReturnType<typeof listMySpaceApplications>> = [];
  let myRegistrations: Awaited<ReturnType<typeof listMyAssetRegistrations>> = [];
  try {
    ecosystems = await listEcosystems().catch(() => []);
    if (session) {
      [myOrgs, myApplications, myRegistrations] = await Promise.all([
        listOrganizationsForActor(session.user.id),
        listMySpaceApplications(session.user.id),
        listMyAssetRegistrations(session.user.id),
      ]);
    }
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="host">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Host data is unavailable">
                The database could not provide this page right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  return (
    <AppShell active="host">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <Eyebrow>Host on Vicus</Eyebrow>
              <h1>Host your community on Vicus.</h1>
              <p>
                A Space showcases your tokenized assets, teaches people what they are, shows
                real ways to use them, publishes lessons, runs activation missions with
                Stellar-settled rewards, builds a contributor community, and reviews submissions —
                together with learners.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>Apply below — no wallet action needed</strong>
              Applications are reviewed by Vicus admins. Approved projects manage their Space
              through the organization studio.
              New to issuance? <Link href="/lab">Prototype an asset on Stellar Testnet</Link> before
              building an activation experience — a Lab demo is not production infrastructure.
            </div>
          </div>
        </header>

        <div className="shell circle-page-body">
          {session && myOrgs.length > 0 ? (
            <section className="hairline-card admin-panel">
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Your Spaces</Eyebrow>
                  <h2>Spaces you belong to.</h2>
                </div>
              </div>
              <ul>
                {myOrgs.map((org) => (
                  <li key={org.id}>
                    <Link href={`/spaces/${org.slug}`}>{org.name}</Link>
                    {" · "}
                    {org.role === "global-admin" ? "global admin view" : `${org.role} access`}
                    {" · "}
                    <Link href={`/admin/organizations/${org.slug}`}>Open Studio →</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
            <div className="admin-panel-header">
              <div>
                <Eyebrow>Apply for a Space</Eyebrow>
                <h2>Tell us about your project.</h2>
              </div>
              <p>Sign in first — applications are tied to your Vicus identity, nothing else. Drafts save automatically as you go and never submit until you confirm.</p>
            </div>
            {session ? <SpaceOnboardingWizard ecosystems={ecosystems} resumeId={resumeId} key={resumeId ?? "new"} /> : <WalletConnectPrompt />}
          </section>

          {session && myApplications.length > 0 ? (
            <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Your applications</Eyebrow>
                  <h2>Real status, no guessing.</h2>
                </div>
              </div>
              <ul>
                {myApplications.map((application) => (
                  <li key={application.id}>
                    <strong>{application.proposedName || "Untitled draft"}</strong> · {statusLabel(application.status)}
                    {application.status === "draft" ? (
                      <>{" · "}<Link href={`/host?resume=${application.id}`}>Resume draft →</Link></>
                    ) : (
                      <>{" · "}applied {application.createdAt.slice(0, 10)}</>
                    )}
                    {application.status === "rejected" && application.reviewNote ? (
                      <p className="control-note">Feedback: {application.reviewNote}</p>
                    ) : null}
                    {application.status === "approved" ? (
                      <p className="control-note">
                        <Link href={`/spaces/${application.proposedSlug}`}>
                          Open your Space <Icon name="arrow-right" size={14} />
                        </Link>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {session && myApplications.length === 0 ? (
            <section className="directory-section">
              <EmptyState title="No applications yet">
                Your applications and their review status will appear here.
              </EmptyState>
            </section>
          ) : null}

          <section className="hairline-card admin-panel" id="asset-registration" style={{ marginTop: 16 }}>
            <div className="admin-panel-header">
              <div>
                <Eyebrow>Asset registration</Eyebrow>
                <h2>Get an asset into the catalogue.</h2>
              </div>
              <p>Request registration for a canonical asset identity with official documentation and public chain records. Admins review sources before anything is listed.</p>
            </div>
            {session ? (
              <AssetRegistrationPanel
                claims={myApplications.flatMap((application) =>
                  (application.assetDetails ?? []).map((asset) => ({
                    applicationId: application.id,
                    applicationName: application.proposedName || "Untitled draft",
                    name: asset.name,
                    network: asset.network,
                    identifier: asset.identifier ?? "",
                  }) satisfies RegistrationClaim),
                )}
                registrations={myRegistrations}
              />
            ) : (
              <p className="control-note">Sign in to request registration — requests are tied to your Vicus identity.</p>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
