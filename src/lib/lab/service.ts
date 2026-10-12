import "server-only";
import { and, eq } from "drizzle-orm";
import { Account, Asset, BASE_FEE, FeeBumpTransaction, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { tokenizationLabRuns } from "@/db/schema";
import {
  LAB_NETWORK_PASSPHRASE,
  getLabIssuerConfig,
  isLabAssetClass,
  isLabPublicKey,
  normalizeLabAssetCode,
} from "@/lib/lab/config";
import { createTestnetHorizon, type LabHorizon } from "@/lib/lab/horizon";
import { normalizeDecimal7 } from "@/lib/missions/config";

export type LabErrorCode =
  | "unauthenticated"
  | "invalid-request"
  | "not-found"
  | "forbidden"
  | "duplicate-code"
  | "invalid-transition"
  | "trustline-unverified"
  | "issuance-in-progress"
  | "verification-unavailable"
  | "lab-unavailable";

export class LabActionError extends Error {
  constructor(
    public readonly code: LabErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export type LabRunView = {
  id: string;
  assetName: string;
  assetCode: string;
  assetClass: string;
  representation: string;
  initialAmount: string;
  issuerPublicKey: string;
  holderPublicKey: string;
  status: string;
  trustlineTxHash: string | null;
  issuanceTxHash: string | null;
  ledger: number | null;
  issuedAt: string | null;
  contractId: string | null;
  createdAt: string;
  updatedAt: string;
};

function preserveExpectedError(error: unknown): boolean {
  return error instanceof LabActionError || isDatabaseUnavailableError(error);
}

async function contractIdFor(assetCode: string, issuer: string): Promise<string | null> {
  try {
    return new Asset(assetCode, issuer).contractId(LAB_NETWORK_PASSPHRASE);
  } catch {
    return null;
  }
}

function mapRunView(
  row: typeof tokenizationLabRuns.$inferSelect,
  contractId: string | null,
): LabRunView {
  return {
    id: row.id,
    assetName: row.assetName,
    assetCode: row.assetCode,
    assetClass: row.assetClass,
    representation: row.representation,
    initialAmount: String(row.initialAmount),
    issuerPublicKey: row.issuerPublicKey,
    holderPublicKey: row.holderPublicKey,
    status: row.status,
    trustlineTxHash: row.trustlineTxHash,
    issuanceTxHash: row.issuanceTxHash,
    ledger: row.ledger,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    contractId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireRun(
  runId: string,
  userId: string | null | undefined,
): Promise<typeof tokenizationLabRuns.$inferSelect> {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new LabActionError("unauthenticated", "Sign in to use the Tokenization Lab.", 401);
  }
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    throw new LabActionError("not-found", "That Lab run could not be found.", 404);
  }
  const database = getDatabase();
  const [run] = await database
    .select()
    .from(tokenizationLabRuns)
    .where(eq(tokenizationLabRuns.id, runId))
    .limit(1);
  if (!run || run.userId !== userId) {
    throw new LabActionError("not-found", "That Lab run could not be found.", 404);
  }
  return run;
}

/**
 * Loser path for the issuance gate: wait briefly for the winning caller to
 * finish, then reuse its persisted result. Returns null when nobody finishes,
 * so the caller still fails safe instead of issuing twice.
 */
async function waitForIssuedRun(
  runId: string,
  userId: string | null | undefined,
): Promise<typeof tokenizationLabRuns.$inferSelect | null> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const current = await requireRun(runId, userId).catch(() => null);
    if (!current) return null;
    if (current.status === "issued") return current;
    if (current.status !== "issuing") return null;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

function asBoundedString(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

export async function createLabRun(
  userId: string | null | undefined,
  input: {
    assetName: unknown;
    assetCode: unknown;
    assetClass: unknown;
    representation: unknown;
    initialAmount: unknown;
    holderPublicKey: unknown;
  },
  environment: NodeJS.ProcessEnv = process.env,
): Promise<LabRunView> {
  try {
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new LabActionError("unauthenticated", "Sign in to use the Tokenization Lab.", 401);
    }
    const assetName = asBoundedString(input.assetName, 2, 120);
    const assetCode = normalizeLabAssetCode(input.assetCode);
    const representation = asBoundedString(input.representation, 10, 2_000);
    const holderPublicKey = isLabPublicKey(input.holderPublicKey) ? input.holderPublicKey : null;
    if (!assetName || !assetCode || !representation || !holderPublicKey) {
      throw new LabActionError(
        "invalid-request",
        "Name, a 1–12 character alphanumeric asset code, a description, and a valid Testnet holder address are required.",
        400,
      );
    }
    if (!isLabAssetClass(input.assetClass)) {
      throw new LabActionError("invalid-request", "Choose a valid asset class.", 400);
    }
    const initialAmount = normalizeDecimal7(input.initialAmount);
    if (!initialAmount) {
      throw new LabActionError("invalid-request", "Set a positive initial issuance amount.", 400);
    }

    let issuerPublicKey: string;
    try {
      ({ issuerPublicKey } = await getLabIssuerConfig(environment));
    } catch {
      throw new LabActionError("lab-unavailable", "Tokenization Lab is temporarily unavailable.", 503);
    }

    const database = getDatabase();
    let created: typeof tokenizationLabRuns.$inferSelect | null = null;
    try {
      const [row] = await database
        .insert(tokenizationLabRuns)
        .values({
          userId,
          assetName,
          assetCode,
          assetClass: String(input.assetClass),
          representation,
          initialAmount,
          issuerPublicKey,
          holderPublicKey,
          status: "draft",
        })
        .returning();
      created = row ?? null;
    } catch {
      // Unique (issuer, code): the code is taken — never silently fork the asset.
      throw new LabActionError(
        "duplicate-code",
        "That asset code is already used by the Lab issuer. Choose another code.",
        409,
      );
    }
    if (!created) throw toDatabaseUnavailableError("create lab run");
    return mapRunView(created, await contractIdFor(assetCode, issuerPublicKey));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("create lab run");
  }
}

export async function listMyLabRuns(userId: string | null | undefined): Promise<LabRunView[]> {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return [];
  try {
    const database = getDatabase();
    const rows = await database
      .select()
      .from(tokenizationLabRuns)
      .where(eq(tokenizationLabRuns.userId, userId))
      .orderBy(tokenizationLabRuns.createdAt);
    return await Promise.all(
      rows.map((row) =>
        contractIdFor(row.assetCode, row.issuerPublicKey).then((contractId) =>
          mapRunView(row, contractId),
        ),
      ),
    );
  } catch {
    throw toDatabaseUnavailableError("list lab runs");
  }
}

export async function getLabRun(
  runId: string,
  userId: string | null | undefined,
): Promise<LabRunView> {
  try {
    const run = await requireRun(runId, userId);
    return mapRunView(run, await contractIdFor(run.assetCode, run.issuerPublicKey));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("get lab run");
  }
}

export async function fundLabWallet(
  runId: string,
  userId: string | null | undefined,
  horizon: LabHorizon = createTestnetHorizon(),
): Promise<{ funded: boolean; alreadyFunded: boolean }> {
  try {
    const run = await requireRun(runId, userId);
    try {
      const result = await horizon.fundViaFriendbot(run.holderPublicKey);
      return { funded: result === "funded", alreadyFunded: result === "already-funded" };
    } catch {
      throw new LabActionError(
        "verification-unavailable",
        "Testnet funding is temporarily unavailable. Try again shortly.",
        503,
      );
    }
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("fund lab wallet");
  }
}

/** Build an unsigned Testnet ChangeTrust envelope for the holder to sign. */
export async function prepareLabTrustline(
  runId: string,
  userId: string | null | undefined,
  holderPublicKey: unknown,
  horizon: LabHorizon = createTestnetHorizon(),
): Promise<{ xdr: string; holder: string; asset: string }> {
  try {
    const holder = isLabPublicKey(holderPublicKey) ? holderPublicKey : null;
    if (!holder) {
      throw new LabActionError("invalid-request", "Provide the Testnet holder address that will sign.", 400);
    }
    const run = await requireRun(runId, userId);
    if (run.status !== "draft") {
      throw new LabActionError(
        "invalid-transition",
        "This run already moved past the trustline step.",
        409,
      );
    }
    if (run.holderPublicKey !== holder) {
      throw new LabActionError(
        "invalid-request",
        "The signing address must match the holder recorded for this run.",
        400,
      );
    }

    let account;
    try {
      account = await horizon.getAccount(holder);
    } catch {
      throw new LabActionError(
        "verification-unavailable",
        "Stellar Testnet is temporarily unavailable. Try again shortly.",
        503,
      );
    }
    if (!account) {
      throw new LabActionError(
        "invalid-request",
        "That Testnet account does not exist yet. Fund the test wallet first.",
        400,
      );
    }

    const envelope = new TransactionBuilder(new Account(holder, account.sequence), {
      fee: BASE_FEE,
      networkPassphrase: LAB_NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.changeTrust({ asset: new Asset(run.assetCode, run.issuerPublicKey) }),
      )
      .setTimeout(300)
      .build()
      .toXDR();

    const database = getDatabase();
    await database
      .update(tokenizationLabRuns)
      .set({ status: "trustline_pending", updatedAt: new Date() })
      .where(
        and(eq(tokenizationLabRuns.id, run.id), eq(tokenizationLabRuns.status, "draft")),
      );
    return { xdr: envelope, holder, asset: `${run.assetCode}:${run.issuerPublicKey}` };
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("prepare lab trustline");
  }
}

function parseSignedEnvelope(signedXdr: string): {
  source: string;
  operations: Array<{ type: string; source: string | null; assetCode: string | null; assetIssuer: string | null }>;
} {
  let transaction;
  try {
    transaction = TransactionBuilder.fromXDR(signedXdr, LAB_NETWORK_PASSPHRASE);
  } catch {
    throw new LabActionError(
      "invalid-request",
      "That signed transaction could not be read. Sign the prepared Testnet envelope.",
      400,
    );
  }
  if (transaction instanceof FeeBumpTransaction) {
    throw new LabActionError(
      "invalid-request",
      "Fee-bump envelopes are not accepted. Sign the prepared Testnet envelope.",
      400,
    );
  }
  return {
    source: transaction.source,
    operations: transaction.operations.map((operation) => {
      const source =
        typeof (operation as { source?: unknown }).source === "string"
          ? (operation as { source: string }).source
          : null;
      let assetCode: string | null = null;
      let assetIssuer: string | null = null;
      if (operation.type === "changeTrust") {
        const line = (operation as Operation.ChangeTrust).line;
        if (line instanceof Asset) {
          assetCode = line.code ?? null;
          assetIssuer = line.issuer ?? null;
        }
      }
      return { type: operation.type, source, assetCode, assetIssuer };
    }),
  };
}

/** Submit the holder-signed trustline and verify it on Testnet. */
export async function submitLabTrustline(
  runId: string,
  userId: string | null | undefined,
  signedXdr: unknown,
  horizon: LabHorizon = createTestnetHorizon(),
): Promise<LabRunView> {
  try {
    if (typeof signedXdr !== "string" || signedXdr.length > 20_000) {
      throw new LabActionError("invalid-request", "Submit the signed Testnet transaction.", 400);
    }
    const run = await requireRun(runId, userId);
    if (run.status !== "trustline_pending" && run.status !== "trustline_confirmed") {
      throw new LabActionError(
        "invalid-transition",
        "This run is not waiting for a trustline.",
        409,
      );
    }

    const envelope = parseSignedEnvelope(signedXdr);
    if (envelope.source !== run.holderPublicKey) {
      throw new LabActionError(
        "invalid-request",
        "The transaction source must be the recorded Testnet holder.",
        400,
      );
    }
    const trustOp = envelope.operations.find(
      (operation) =>
        operation.type === "changeTrust" &&
        (operation.source ?? envelope.source) === run.holderPublicKey &&
        operation.assetCode === run.assetCode &&
        operation.assetIssuer === run.issuerPublicKey,
    );
    if (!trustOp) {
      throw new LabActionError(
        "invalid-request",
        "The envelope must carry the ChangeTrust for this Lab asset.",
        400,
      );
    }

    let submitted;
    try {
      submitted = await horizon.submitTransaction(signedXdr);
    } catch {
      throw new LabActionError(
        "verification-unavailable",
        "Stellar Testnet is temporarily unavailable. Nothing was judged — try again shortly.",
        503,
      );
    }
    if (!submitted.successful) {
      throw new LabActionError(
        "trustline-unverified",
        "The Testnet transaction did not succeed.",
        400,
      );
    }

    // Network verification: the account must actually hold the trustline now.
    let account;
    try {
      account = await horizon.getAccount(run.holderPublicKey);
    } catch {
      throw new LabActionError(
        "verification-unavailable",
        "Trustline verification is temporarily unavailable. Try again shortly.",
        503,
      );
    }
    const confirmed = Boolean(
      account?.balances.some(
        (entry) => entry.assetCode === run.assetCode && entry.assetIssuer === run.issuerPublicKey,
      ),
    );
    if (!confirmed) {
      throw new LabActionError(
        "trustline-unverified",
        "The trustline could not be confirmed on Testnet yet. Try again shortly.",
        400,
      );
    }

    const database = getDatabase();
    const [updated] = await database
      .update(tokenizationLabRuns)
      .set({ status: "trustline_confirmed", trustlineTxHash: submitted.hash, updatedAt: new Date() })
      .where(eq(tokenizationLabRuns.id, run.id))
      .returning();
    if (!updated) throw toDatabaseUnavailableError("confirm lab trustline");
    return mapRunView(updated, await contractIdFor(run.assetCode, run.issuerPublicKey));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("submit lab trustline");
  }
}

/** Adopt a matching onchain issuance payment for a run, if one exists. */
async function adoptIssuerPayment(
  runId: string,
  userId: string | null | undefined,
  horizon: LabHorizon,
  expectedAmount: string,
): Promise<LabRunView | null> {
  const run = await requireRun(runId, userId);
  let existing = null;
  try {
    existing = await horizon.findIssuerPayment(run.issuerPublicKey, {
      destination: run.holderPublicKey,
      assetCode: run.assetCode,
      amount: expectedAmount,
    });
  } catch {
    return null;
  }
  if (!existing) return null;
  const database = getDatabase();
  const [adopted] = await database
    .update(tokenizationLabRuns)
    .set({
      status: "issued",
      issuanceTxHash: existing.hash,
      ledger: existing.ledger,
      issuedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tokenizationLabRuns.id, run.id))
    .returning();
  if (!adopted) return null;
  return mapRunView(adopted, await contractIdFor(run.assetCode, run.issuerPublicKey));
}

/** Build and server-sign the exact issuance payment for a run. */
async function buildIssuanceEnvelope(
  run: typeof tokenizationLabRuns.$inferSelect,
  issuerSecret: string,
  horizon: LabHorizon,
  expectedAmount: string,
): Promise<string> {
  const issuerKeypair = Keypair.fromSecret(issuerSecret);
  if (issuerKeypair.publicKey() !== run.issuerPublicKey) {
    throw new LabActionError("lab-unavailable", "Tokenization Lab is temporarily unavailable.", 503);
  }
  let issuerAccount;
  try {
    issuerAccount = await horizon.getAccount(run.issuerPublicKey);
  } catch {
    throw new LabActionError(
      "verification-unavailable",
      "Stellar Testnet is temporarily unavailable. The run stays resumable — try again shortly.",
      503,
    );
  }
  if (!issuerAccount) {
    throw new LabActionError("lab-unavailable", "Tokenization Lab is temporarily unavailable.", 503);
  }
  const payment = new TransactionBuilder(new Account(run.issuerPublicKey, issuerAccount.sequence), {
    fee: BASE_FEE,
    networkPassphrase: LAB_NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: run.holderPublicKey,
        asset: new Asset(run.assetCode, run.issuerPublicKey),
        amount: expectedAmount,
      }),
    )
    .setTimeout(300)
    .build();
  payment.sign(issuerKeypair);
  return payment.toXDR();
}

/**
 * Submit a signed issuance envelope and confirm it on Testnet.
 * A conflicting submission (same issuer sequence already used) falls back to
 * adopting the matching onchain payment — concurrent issuers converge on one
 * persisted result and can never double-issue this run.
 */
async function submitAndConfirmIssuance(
  runId: string,
  userId: string | null | undefined,
  horizon: LabHorizon,
  signedXdr: string,
  expectedAmount: string,
): Promise<LabRunView> {
  const run = await requireRun(runId, userId);
  let submitted;
  try {
    submitted = await horizon.submitTransaction(signedXdr);
  } catch {
    const adopted = await adoptIssuerPayment(runId, userId, horizon, expectedAmount);
    if (adopted) return adopted;
    throw new LabActionError(
      "verification-unavailable",
      "Stellar Testnet is temporarily unavailable. The run stays resumable — try again shortly.",
      503,
    );
  }
  if (!submitted.successful) {
    throw new LabActionError("trustline-unverified", "The issuance transaction did not succeed.", 400);
  }
  let operations;
  try {
    operations = await horizon.getTransactionOperations(submitted.hash);
  } catch {
    throw new LabActionError(
      "verification-unavailable",
      "Issuance verification is temporarily unavailable. The run stays resumable — try again shortly.",
      503,
    );
  }
  const matched = operations.some(
    (operation) =>
      operation.type === "payment" &&
      operation.assetCode === run.assetCode &&
      operation.assetIssuer === run.issuerPublicKey,
  );
  if (!matched) {
    throw new LabActionError("trustline-unverified", "The issuance could not be verified on Testnet.", 400);
  }
  const database = getDatabase();
  const [issued] = await database
    .update(tokenizationLabRuns)
    .set({
      status: "issued",
      issuanceTxHash: submitted.hash,
      ledger: submitted.ledger,
      issuedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tokenizationLabRuns.id, run.id))
    .returning();
  if (!issued) throw toDatabaseUnavailableError("issue lab asset");
  return mapRunView(issued, await contractIdFor(run.assetCode, run.issuerPublicKey));
}

/** Build, sign, and persist the issuance envelope so a crash can resume it. */
async function persistIssuanceEnvelope(
  run: typeof tokenizationLabRuns.$inferSelect,
  issuerSecret: string,
  horizon: LabHorizon,
  expectedAmount: string,
): Promise<string> {
  const envelope = await buildIssuanceEnvelope(run, issuerSecret, horizon, expectedAmount);
  const database = getDatabase();
  await database
    .update(tokenizationLabRuns)
    .set({ issuanceEnvelope: envelope, updatedAt: new Date() })
    .where(eq(tokenizationLabRuns.id, run.id));
  return envelope;
}

/** Issue exactly once: guarded transition, server-signed, Testnet-verified. */
export async function issueLabAsset(
  runId: string,
  userId: string | null | undefined,
  horizon: LabHorizon = createTestnetHorizon(),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<LabRunView> {
  try {
    const run = await requireRun(runId, userId);
    if (run.status === "issued") {
      return mapRunView(run, await contractIdFor(run.assetCode, run.issuerPublicKey));
    }
    if (run.status !== "trustline_confirmed" && run.status !== "issuing") {
      throw new LabActionError(
        "invalid-transition",
        run.status === "draft" || run.status === "trustline_pending"
          ? "Confirm the trustline before issuing."
          : "This run cannot issue in its current state.",
        409,
      );
    }
    if (run.status === "issuing") {
      const expectedRecoveryAmount = String(run.initialAmount);
      // A live worker finishes in milliseconds — reuse its result.
      const winner = await waitForIssuedRun(run.id, userId);
      if (winner) {
        return mapRunView(winner, await contractIdFor(winner.assetCode, winner.issuerPublicKey));
      }
      // No live worker: adopt an existing onchain issuance, else resume with
      // the persisted envelope (network-idempotent) or a fresh build when
      // nothing was ever submitted.
      const adopted = await adoptIssuerPayment(run.id, userId, horizon, expectedRecoveryAmount);
      if (adopted) return adopted;
      const recovery = await requireRun(runId, userId);
      let issuerSecret: string;
      try {
        ({ issuerSecret } = await getLabIssuerConfig(environment));
      } catch {
        throw new LabActionError("lab-unavailable", "Tokenization Lab is temporarily unavailable.", 503);
      }
      const envelope =
        recovery.issuanceEnvelope ??
        (await persistIssuanceEnvelope(recovery, issuerSecret, horizon, expectedRecoveryAmount));
      return submitAndConfirmIssuance(run.id, userId, horizon, envelope, expectedRecoveryAmount);
    }

    let issuerSecret: string;
    try {
      ({ issuerSecret } = await getLabIssuerConfig(environment));
    } catch {
      throw new LabActionError("lab-unavailable", "Tokenization Lab is temporarily unavailable.", 503);
    }

    const database = getDatabase();
    // Single-winner gate: only one caller moves confirmed → issuing.
    const [locked] = await database
      .update(tokenizationLabRuns)
      .set({ status: "issuing", updatedAt: new Date() })
      .where(
        and(eq(tokenizationLabRuns.id, run.id), eq(tokenizationLabRuns.status, "trustline_confirmed")),
      )
      .returning();
    if (!locked) {
      // A concurrent caller won the issuance gate. Reuse the winner's result
      // instead of re-entering issuance — exactly-once is preserved.
      const winner = await waitForIssuedRun(run.id, userId);
      if (winner) {
        return mapRunView(winner, await contractIdFor(winner.assetCode, winner.issuerPublicKey));
      }
      throw new LabActionError("issuance-in-progress", "Issuance is already in progress for this run.", 409);
    }

    const expectedAmount = String(run.initialAmount);

    // Crash recovery: adopt a matching issuance already on Testnet.
    const adopted = await adoptIssuerPayment(run.id, userId, horizon, expectedAmount);
    if (adopted) return adopted;

    const winnerEnvelope = await persistIssuanceEnvelope(locked, issuerSecret, horizon, expectedAmount);
    return submitAndConfirmIssuance(run.id, userId, horizon, winnerEnvelope, expectedAmount);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("issue lab asset");
  }
}
