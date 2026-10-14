import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { getDatabase } from "../src/db";
import { seedAssetActions } from "./seed-asset-actions";
import { getCircleCapabilities } from "../src/lib/utility/service";
import { getSendableAsset } from "../src/lib/send/service";
import { getExecutionGate } from "../src/lib/asset-access/service";
import { LENDING_MARKET_URL } from "../src/lib/lending/config";
import { getCircleLifecycle } from "../src/lib/lifecycle/service";
import {
  ACTION_ADAPTERS,
  resolveAssetActions,
} from "../src/lib/asset-actions/service";
import { resolveEligibility } from "../src/lib/asset-actions/eligibility";
import {
  ACTION_KINDS,
  ACTION_STATES,
  isKnownActionKind,
  type ResolvedAssetAction,
} from "../src/lib/asset-actions/config";

config({ path: ".env.local" });
config({ path: ".env" });

const STELLAR_NON_STABLE = ["benji-on-stellar", "wtgxx-on-stellar", "spxux-on-stellar", "usdy-on-stellar"];
const FAKE_METRIC = /apy|%|\$\d|yield\s+\d|x\s+returns?/i;

function kinds(actions: ResolvedAssetAction[]): string[] {
  return actions.map((action) => action.kind);
}

async function main() {
  // Importing the seed module runs it once; a second explicit run must be a
  // no-op change, proving idempotent upsert.
  const before = new Map<string, number>();
  for (const slug of [...STELLAR_NON_STABLE, "usdc-on-stellar", "pyusd-on-stellar"]) {
    before.set(slug, (await getCircleCapabilities(slug)).length);
  }
  const rerun = await seedAssetActions();
  assert.equal(rerun.skipped, 0, "every action seed slug resolves");
  for (const slug of [...STELLAR_NON_STABLE, "usdc-on-stellar", "pyusd-on-stellar"]) {
    assert.equal((await getCircleCapabilities(slug)).length, before.get(slug), `${slug}: seed rerun changed nothing`);
  }

  // 1. Kinds valid; every action carries its source; states valid.
  const sample: Record<string, ResolvedAssetAction[]> = {};
  for (const slug of ["usdc-on-stellar", "benji-on-stellar", "wtgxx-on-stellar", "usdy-on-stellar", "aaplc-on-base", "usdc-on-base"]) {
    sample[slug] = await resolveAssetActions(slug, slug.endsWith("base") ? "Base" : "Stellar");
  }
  for (const [slug, actions] of Object.entries(sample)) {
    for (const action of actions) {
      assert.ok(isKnownActionKind(action.kind), `${slug}: known kind ${action.kind}`);
      assert.ok((ACTION_KINDS as readonly string[]).includes(action.kind), `${slug}: kind in vocabulary`);
      assert.ok((ACTION_STATES as readonly string[]).includes(action.state), `${slug}: valid state`);
      assert.ok(action.sourceUrl.startsWith("https://"), `${slug}/${action.kind}: source required`);
      assert.ok(action.href.length > 0, `${slug}/${action.kind}: route required`);
      assert.ok(action.title.length > 0 && action.description.length > 0, `${slug}/${action.kind}: copy required`);
    }
  }

  // 2. Send mirrors the actual Send policy — never more, never less.
  for (const slug of ["usdc-on-stellar", "pyusd-on-stellar", "benji-on-stellar", "wtgxx-on-stellar"]) {
    const policy = getSendableAsset(slug);
    assert.ok(policy, `${slug}: policy enables Send`);
    const actions = sample[slug] ?? (await resolveAssetActions(slug, "Stellar"));
    const send = actions.find((action) => action.kind === "send");
    assert.ok(send, `${slug}: SEND resolved`);
    assert.equal(send!.executionMode, "vicus", `${slug}: SEND executes in Vicus`);
    assert.ok(send!.href.startsWith("/send?asset="), `${slug}: SEND routes to /send`);
    assert.equal(send!.state, policy!.permissioned ? "permissioned" : "available", `${slug}: permissioned label mirrors policy`);
  }
  for (const slug of ["usdy-on-stellar", "wtsyx-on-stellar", "tipsx-on-stellar", "spxux-on-stellar", "techx-on-stellar"]) {
    assert.equal(getSendableAsset(slug), null, `${slug}: policy blocks Send`);
    const actions = await resolveAssetActions(slug, "Stellar");
    assert.ok(!actions.some((action) => action.kind === "send"), `${slug}: no SEND without policy`);
  }

  // 3. CCTP MOVE stays USDC-on-Stellar-only.
  assert.ok(kinds(sample["usdc-on-stellar"]!).includes("move"), "MOVE on Stellar USDC");
  const moveAction = sample["usdc-on-stellar"]!.find((action) => action.kind === "move")!;
  assert.equal(moveAction.executionMode, "vicus", "MOVE executes in Vicus");
  assert.equal(moveAction.href, "/access", "MOVE routes to Access");
  assert.ok(!kinds(sample["usdc-on-base"]!).includes("move"), "no MOVE on Base USDC");
  const benjiActions = await resolveAssetActions("benji-on-stellar", "Stellar");
  assert.ok(!kinds(benjiActions).includes("move"), "no MOVE on BENJI");

  // 4. AAPLc acquisition stays honestly gated through the same resolver.
  const aaplc = sample["aaplc-on-base"]!;
  const gate = getExecutionGate();
  assert.equal(gate.enabled, false, "acquisition gate off");
  const access = aaplc.find((action) => action.kind === "access");
  assert.ok(access, "AAPLc ACCESS resolves");
  assert.equal(access!.executionMode, "vicus", "AAPLc ACCESS routes inside Vicus");
  assert.ok(access!.href.startsWith("/acquire/"), "AAPLc ACCESS opens the router");
  assert.equal(access!.state, "permissioned", "gated acquisition labeled, never fake-available");
  assert.ok(!aaplc.some((action) => action.kind === "send" || action.kind === "move"), "no fake AAPLc execution");

  // 5. Unsupported actions are absent everywhere — never coming_soon bait.
  // Lending V1: AAPLc alone carries a verified Morpho borrow route; every
  // other sampled asset must stay borrow/collateral-free.
  for (const [slug, actions] of Object.entries(sample)) {
    if (slug === "aaplc-on-base") {
      assert.ok(actions.some((action) => action.kind === "borrow"), "AAPLc verified borrow present");
      assert.ok(!actions.some((action) => action.kind === "collateral"), "AAPLc: no collateralize action");
    } else {
      assert.ok(!actions.some((action) => action.kind === "borrow" || action.kind === "collateral"), `${slug}: no unverified lending`);
    }
    assert.ok(!actions.some((action) => action.kind === "swap"), `${slug}: no unverified swaps`);
    assert.ok(!actions.some((action) => action.state === "coming_soon" || action.state === "unavailable"), `${slug}: no placeholder states`);
  }

  // 6. Non-stablecoin Stellar assets expose real, source-backed actions.
  for (const slug of STELLAR_NON_STABLE) {
    const actions = await resolveAssetActions(slug, "Stellar");
    assert.ok(actions.length >= 3, `${slug}: meaningful action set`);
    assert.ok(actions.some((action) => action.kind === "access"), `${slug}: ACCESS present`);
    assert.ok(actions.some((action) => action.kind === "earn"), `${slug}: EARN present`);
    assert.ok(actions.some((action) => action.kind === "redeem"), `${slug}: REDEEM present`);
    assert.ok(actions.every((action) => action.executionMode !== "vicus" || action.kind === "send"), `${slug}: only Send executes in Vicus`);
  }

  // 7. Lifecycle relationship: stages explain, actions route — both intact.
  const benjiLifecycle = await getCircleLifecycle("benji-on-stellar");
  assert.ok(benjiLifecycle.some((stage) => stage.stage === "earn"), "BENJI earn stage intact");
  const benjiEarnAction = benjiActions.find((action) => action.kind === "earn")!;
  assert.ok(benjiEarnAction.description !== benjiLifecycle.find((stage) => stage.stage === "earn")!.shortDescription, "action copy complements lifecycle, not duplicates");

  // 8. No fake financial metrics anywhere in action copy.
  for (const [slug, actions] of Object.entries(sample)) {
    for (const action of actions) {
      const copy = `${action.title} ${action.description} ${action.stateLabel}`;
      assert.ok(!FAKE_METRIC.test(copy), `${slug}/${action.kind}: no invented metrics`);
    }
  }

  // 9. External assets resolve through the same engine — no chain branching.
  assert.ok(sample["usdc-on-base"]!.length > 0, "Base USDC resolves");
  assert.ok(aaplc.length > 0, "AAPLc resolves");
  assert.ok(aaplc.every((action) => action.network === "Base"), "AAPLc actions carry Base network");

  // 10. Public payload leaks no private data: no user/order/wallet material,
  // and no raw onchain addresses inside action copy. The verified Morpho
  // market route (an app URL carrying the pinned market id) is exempt — it
  // is a route, not a wallet or contract a user could confuse for one.
  for (const [slug, actions] of Object.entries(sample)) {
    const payload = JSON.stringify(actions).split(LENDING_MARKET_URL).join("");
    assert.ok(!payload.includes("userId") && !payload.includes("orderId"), `${slug}: no user/order keys`);
    assert.ok(!/privateKey|seed phrase/i.test(payload), `${slug}: no secret-shaped fields`);
    assert.ok(!/0x[0-9a-fA-F]{40}/.test(payload), `${slug}: no raw addresses in actions`);
  }

  // 11. Adapter registry agrees with resolution (future adapters plug in here).
  // Direction: an adapter claiming support must produce the action. The
  // converse need not hold — seeded source-backed rows (e.g. BENJI access)
  // can supply a kind without a Vicus execution adapter.
  for (const adapter of ACTION_ADAPTERS) {
    for (const slug of ["usdc-on-stellar", "benji-on-stellar", "aaplc-on-base", "usdc-on-base"]) {
      const resolved = (await resolveAssetActions(slug, "test")).some((action) => action.kind === adapter.kind);
      assert.ok(!adapter.supports(slug) || resolved, `${adapter.kind}/${slug}: supported adapter emits the action`);
    }
  }

  // 12. Canonical ordering holds on a representative asset.
  assert.deepEqual(kinds(benjiActions), ["access", "send", "earn", "redeem"], "BENJI canonical order");

  // 13. P2.1 Compass: deterministic eligibility contexts over fixed
  // fixtures (USDC / BENJI / AAPLx shapes). No wallets, no network calls —
  // UNKNOWN must stay explicitly unknown and never resolve as available.
  const compassCtx = (
    assetSlug: string,
    actionKind: string,
    actionState: "available" | "permissioned" | "coming_soon" | "unavailable",
    executionMode: "vicus" | "connected" | "official" | "guide",
    extra: Partial<Parameters<typeof resolveEligibility>[0]> = {},
  ): Parameters<typeof resolveEligibility>[0] => ({
    assetSlug,
    actionKind,
    actionState,
    executionMode,
    network: "Stellar Mainnet",
    eligibilityNote: null,
    href: `/circles/${assetSlug}`,
    session: null,
    roleStatus: null,
    ...extra,
  });
  const signedOut = null;
  const signedIn = { signedIn: true, walletPublicKey: null };
  // USDC Send signed-out: live route, but unknown FOR THIS visitor.
  const usdcSendOut = resolveEligibility(compassCtx("usdc-on-stellar", "send", "available", "vicus", { session: signedOut }));
  assert.equal(usdcSendOut.state, "unknown", "USDC send signed-out is unknown");
  assert.ok(/Unknown/i.test(usdcSendOut.explanation), "USDC send signed-out says unknown");
  assert.ok((usdcSendOut.requiresWallet ?? "").includes("Freighter"), "USDC send names the Stellar wallet");
  // USDC Send signed-in, no role check: available without inventing holdings.
  const usdcSendIn = resolveEligibility(compassCtx("usdc-on-stellar", "send", "available", "vicus", { session: signedIn }));
  assert.equal(usdcSendIn.state, "available", "USDC send signed-in is available");
  assert.ok(/sign/i.test(usdcSendIn.explanation), "USDC send still requires signature");
  assert.ok(/nothing.*assumed|assumed/i.test(usdcSendIn.explanation), "USDC send disclaims assumed holdings");
  assert.ok(!/verified-holder|positive balance/i.test(usdcSendIn.explanation), "USDC send invents no holder proof without a role check");
  // BENJI Send is permissioned: restricted with the issuer note.
  const benjiSend = resolveEligibility(
    compassCtx("benji-on-stellar", "send", "permissioned", "vicus", {
      session: signedIn,
      eligibilityNote: "Recipient wallets must be authorized by the issuer.",
    }),
  );
  assert.equal(benjiSend.state, "unavailable", "BENJI send is unavailable");
  assert.ok((benjiSend.restriction ?? "").includes("authorized by the issuer"), "BENJI restriction carried");
  // AAPLx swap signed-out: connected execution stays unknown.
  const aaplxSwapOut = resolveEligibility(compassCtx("aaplx-on-solana", "swap", "available", "connected", { session: signedOut }));
  assert.equal(aaplxSwapOut.state, "unknown", "AAPLx swap signed-out is unknown");
  assert.ok((aaplxSwapOut.requiresWallet ?? "").includes("Solana"), "AAPLx swap names Solana");
  // AAPLx access with only a Stellar session: still unknown, never available.
  const aaplxAccessIn = resolveEligibility(compassCtx("aaplx-on-solana", "access", "available", "connected", { session: signedIn }));
  assert.equal(aaplxAccessIn.state, "unknown", "AAPLx access with Stellar-only session is unknown");
  // Unsupported engine states can never enable.
  const gated = resolveEligibility(compassCtx("x", "earn", "unavailable", "guide", { session: signedIn }));
  assert.equal(gated.state, "unavailable", "unavailable stays unavailable");
  assert.ok(gated.nextAction?.href === "/discover", "unavailable points at discovery");
  const soon = resolveEligibility(compassCtx("x", "earn", "coming_soon", "guide", { session: signedIn }));
  assert.equal(soon.state, "unknown", "coming_soon stays unknown");
  assert.ok(/Unknown/i.test(soon.explanation), "coming_soon says unknown");
  // Live role evidence refines Stellar wallet-gated actions honestly.
  const holder = resolveEligibility(
    compassCtx("usdc-on-stellar", "send", "available", "vicus", { session: signedIn, roleStatus: "verified-holder" }),
  );
  assert.equal(holder.state, "available", "verified holder is available");
  const noTrust = resolveEligibility(
    compassCtx("usdc-on-stellar", "send", "available", "vicus", { session: signedIn, roleStatus: "not-qualified" }),
  );
  assert.equal(noTrust.state, "unavailable", "not-qualified is unavailable");
  const rpcDown = resolveEligibility(
    compassCtx("usdc-on-stellar", "send", "available", "vicus", { session: signedIn, roleStatus: "verification-unavailable" }),
  );
  assert.equal(rpcDown.state, "unknown", "unreachable network is unknown");
  // Every verdict explains itself and never leaks secrets-shaped content.
  for (const verdict of [usdcSendOut, usdcSendIn, benjiSend, aaplxSwapOut, aaplxAccessIn, gated, soon, holder, noTrust, rpcDown]) {
    assert.ok(verdict.explanation.length > 20, `${verdict.assetSlug}/${verdict.actionKind}: explanation present`);
    assert.ok(!/privateKey|seed phrase/i.test(JSON.stringify(verdict)), "no secret-shaped fields");
  }

  console.log("asset-actions:verify ok — 13 groups, all assertions passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
