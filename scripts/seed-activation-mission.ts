import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetCapabilities, assets, circles, missions, organizations } from "../src/db/schema";
import { normalizeDecimal7 } from "../src/lib/missions/config";

config({ path: ".env.local" });
config({ path: ".env" });

// One real activation campaign: Send USDC on Stellar.
// Minimum 1 USDC: a deliberately small whole-unit real payment — large enough
// to be a genuine activation, small enough for a demo. Points (250) match the
// existing mission norm; the 0.05 XLM Testnet reward follows the spec example.
// proofNotBefore is set at seed time so only new payments qualify.
// This script never performs a transaction and never fabricates a payment.

async function seed() {
  const database = getDatabase();

  const [existing] = await database
    .select({ id: missions.id })
    .from(missions)
    .innerJoin(circles, eq(missions.circleId, circles.id))
    .where(
      and(
        eq(circles.slug, "usdc-on-stellar"),
        eq(missions.type, "onchain_action"),
        eq(missions.status, "open"),
      ),
    )
    .limit(1);
  if (existing) {
    console.log("Activation mission already present. No changes made.");
    return;
  }

  const [circle] = await database
    .select({
      id: circles.id,
      verificationMode: assets.verificationMode,
      stellarNetwork: assets.stellarNetwork,
      stellarAssetCode: assets.stellarAssetCode,
      stellarIssuerAccount: assets.stellarIssuerAccount,
    })
    .from(circles)
    .leftJoin(assets, eq(circles.assetId, assets.id))
    .where(eq(circles.slug, "usdc-on-stellar"))
    .limit(1);
  if (
    !circle ||
    circle.verificationMode !== "classic-asset" ||
    circle.stellarNetwork !== "mainnet" ||
    !circle.stellarAssetCode ||
    !circle.stellarIssuerAccount
  ) {
    console.log("USDC on Stellar lacks verified Mainnet asset config. Mission not created.");
    process.exitCode = 1;
    return;
  }

  const [capability] = await database
    .select({ id: assetCapabilities.id })
    .from(assetCapabilities)
    .where(
      and(
        eq(assetCapabilities.circleId, circle.id),
        eq(assetCapabilities.capabilityType, "send"),
        eq(assetCapabilities.active, true),
      ),
    )
    .limit(1);
  if (!capability) {
    console.log("USDC on Stellar lacks an active Send capability. Mission not created.");
    process.exitCode = 1;
    return;
  }

  const minimumAmount = normalizeDecimal7("1");
  if (!minimumAmount) {
    console.log("Invalid minimum amount. Mission not created.");
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const [circleOrg] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "circle"))
    .limit(1);
  const [created] = await database
    .insert(missions)
    .values({
      circleId: circle.id,
      campaignId: null,
      organizationId: circleOrg?.id ?? null,
      type: "onchain_action",
      title: "Send USDC on Stellar",
      description:
        "Use USDC on Stellar in a real Mainnet payment of at least 1 USDC from your connected wallet, then prove it with the Stellar transaction hash. Vicus verifies the payment onchain — no custody, no signing, no secret keys.",
      points: 250,
      rewardAsset: "XLM",
      rewardAmount: "0.0500000",
      eligibilityRule: { kind: "education-only", note: "Activation verified onchain; eligibility follows approval state." },
      missionConfig: {
        kind: "onchain_action",
        network: "stellar_mainnet",
        action: "payment",
        assetCode: circle.stellarAssetCode,
        assetIssuer: circle.stellarIssuerAccount,
        minimumAmount,
        proofNotBefore: now.toISOString(),
      },
      assetCapabilityId: capability.id,
      duplicatePolicy: "allow-revision",
      reviewMode: "automatic",
      status: "open",
      startsAt: null,
      endsAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: missions.id });

  console.log(`Activation mission created: ${created?.id ?? "unknown"}.`);
}

seed().catch((error) => {
  console.error("Activation seeding failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
