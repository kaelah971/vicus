import type { Metadata } from "next";
import Link from "next/link";
import { DataState, EmptyState, Eyebrow } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { listOrganizationsForActor } from "@/lib/organizations/service";
import { OrgCreateForm } from "@/components/org-studio-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organizations",
  description: "Organizations hosting Asset Circles, lessons, and missions on Vicus.",
};

export default async function OrganizationsPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="admin">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Organization data is unavailable">
                The database could not provide the signed-in session.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!session) {
    return (
      <AppShell active="admin">
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Sign in to view organizations">
              Organization studios are visible to members and global admins.
              <WalletConnectPrompt />
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  let orgs: Awaited<ReturnType<typeof listOrganizationsForActor>> = [];
  try {
    orgs = await listOrganizationsForActor(session.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="admin">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Organization data is unavailable">
                The database could not provide organizations right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  const isGlobalAdmin = session.user.role === "admin";

  return (
    <AppShell active="admin">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <Eyebrow>Organization studios</Eyebrow>
              <h1>Projects with a Vicus presence.</h1>
              <p>
                {isGlobalAdmin
                  ? "Every organization, with full management access."
                  : "Organizations you belong to. Membership is granted by an organization owner or admin."}
              </p>
            </div>
            <div className="page-intro-note">
              <strong>{`${orgs.length} organizations`}</strong>
              Organizations host Circles, publish lessons, and run missions.
            </div>
          </div>
        </header>

        <div className="shell circle-page-body">
          {orgs.length > 0 ? (
            <div className="mission-grid">
              {orgs.map((org) => (
                <article className="mission-card" key={org.id}>
                  <div className="mission-card-header">
                    <span className="mission-type">
                      {org.role === "global-admin" ? "Global admin view" : `${org.role} access`}
                    </span>
                  </div>
                  <h3>
                    <Link href={`/admin/organizations/${org.slug}`}>{org.name}</Link>
                  </h3>
                  <p>{org.description}</p>
                  <div className="mission-footer">
                    <Link className="mission-action-link" href={`/admin/organizations/${org.slug}`}>
                      Open studio
                    </Link>
                    <Link className="mission-action-link" href={`/organizations/${org.slug}`}>
                      Public page
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="directory-section">
              <EmptyState title="No organizations yet">
                You do not belong to any organization yet. Membership is granted by an organization owner or admin.
              </EmptyState>
            </section>
          )}

          {isGlobalAdmin ? (
            <section className="hairline-card admin-panel" style={{ marginTop: 24 }}>
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>New organization</Eyebrow>
                  <h2>Give a project a Vicus presence.</h2>
                </div>
                <p>Only global admins can create organizations. Circles are associated afterwards.</p>
              </div>
              <OrgCreateForm />
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
