import { redirect } from "next/navigation";

type OrgAliasProps = {
  params: Promise<{ slug: string }>;
};

// Compatibility alias: the canonical public route is /spaces/[slug].
export default async function OrganizationAliasPage({ params }: OrgAliasProps) {
  const { slug } = await params;
  redirect(`/spaces/${slug}`);
}
