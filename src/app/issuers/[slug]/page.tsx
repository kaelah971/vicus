import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Issuers resolve through the same subject model — one read path. */
export default async function IssuerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/subjects/${slug}`);
}
