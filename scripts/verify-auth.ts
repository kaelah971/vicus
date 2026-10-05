import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { Keypair } from "@stellar/stellar-sdk";
import { authChallenges, authSessions, missionSubmissions, missions, stellarWallets, users } from "../src/db/schema";
import { getDatabase } from "../src/db";
import { getVicusAuthConfig } from "../src/lib/auth/config";
import { revokeSessionToken, hashSessionToken } from "../src/lib/auth/session";
import {
  issueWalletMessageChallenge,
  verifyWalletMessage,
  WalletMessageError,
} from "../src/lib/auth/stellar";
import { parseMissionConfig } from "../src/lib/missions/config";
import { submitMission } from "../src/lib/missions/service";

config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const database = getDatabase();
const configValues = getVicusAuthConfig();
const client = Keypair.random();
const wrongSigner = Keypair.random();
const challengeHashes: string[] = [];
let createdUserId = "";

function hashMessage(message: string) {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

function signMessage(keypair: typeof client, message: string) {
  return Buffer.from(keypair.signMessage(message)).toString("base64");
}

async function issueChallenge() {
  const challenge = await issueWalletMessageChallenge(client.publicKey());
  challengeHashes.push(hashMessage(challenge.message));
  return challenge;
}

async function expectMessageFailure(message: string, signature: string) {
  await assert.rejects(
    () => verifyWalletMessage(message, signature),
    (error: unknown) => error instanceof WalletMessageError,
  );
}

async function verify() {
  try {
    const validChallenge = await issueChallenge();
    const validSignature = signMessage(client, validChallenge.message);
    const authenticated = await verifyWalletMessage(validChallenge.message, validSignature);
    createdUserId = authenticated.user.id;

    assert.equal(authenticated.wallet.publicKey, client.publicKey());
    assert.equal(authenticated.wallet.network, "mainnet");
    const [createdSession] = await database
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, hashSessionToken(authenticated.session.token)))
      .limit(1);
    assert(createdSession, "A hashed session should be created after message verification.");
    assert.equal(createdSession.revokedAt, null);
    const [consumedChallenge] = await database
      .select({ consumedAt: authChallenges.consumedAt })
      .from(authChallenges)
      .where(eq(authChallenges.challengeHash, hashMessage(validChallenge.message)))
      .limit(1);
    assert(consumedChallenge?.consumedAt, "A successful wallet message must consume its challenge.");

    const [quiz] = await database.select().from(missions).where(eq(missions.type, "quiz")).limit(1);
    assert(quiz, "The seeded quiz mission is required for auth verification.");
    const quizConfig = parseMissionConfig(quiz.missionConfig);
    assert(quizConfig?.kind === "quiz", "The seeded quiz configuration is invalid.");
    const submission = await submitMission(
      quiz.id,
      { answers: Object.fromEntries(quizConfig.questions.map((question) => [question.id, question.correctAnswer])) },
      authenticated.user.id,
    );
    assert.equal(submission.submission.status, "approved");
    const [storedSubmission] = await database
      .select({ userId: missionSubmissions.userId })
      .from(missionSubmissions)
      .where(eq(missionSubmissions.id, submission.submission.id))
      .limit(1);
    assert.equal(storedSubmission?.userId, authenticated.user.id);

    await expectMessageFailure(validChallenge.message, validSignature);

    const wrongSignerChallenge = await issueChallenge();
    await expectMessageFailure(wrongSignerChallenge.message, signMessage(wrongSigner, wrongSignerChallenge.message));

    const alteredChallenge = await issueChallenge();
    const alteredMessage = alteredChallenge.message.replace(
      /^Nonce: ([^\n]+)$/m,
      (_, nonce: string) => `Nonce: ${nonce.slice(0, -1)}${nonce.endsWith("a") ? "b" : "a"}`,
    );
    await expectMessageFailure(alteredMessage, signMessage(client, alteredMessage));

    const mismatchChallenge = await issueChallenge();
    const mismatchMessage = mismatchChallenge.message.replace(
      `Address: ${client.publicKey()}`,
      `Address: ${wrongSigner.publicKey()}`,
    );
    await expectMessageFailure(mismatchMessage, signMessage(client, mismatchMessage));

    const domainChallenge = await issueChallenge();
    const domainMessage = domainChallenge.message.replace(
      `Domain: ${configValues.homeDomain}`,
      "Domain: attacker.example",
    );
    await expectMessageFailure(domainMessage, signMessage(client, domainMessage));

    const expiredChallenge = await issueChallenge();
    await database
      .update(authChallenges)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(authChallenges.challengeHash, hashMessage(expiredChallenge.message)));
    await expectMessageFailure(expiredChallenge.message, signMessage(client, expiredChallenge.message));

    await revokeSessionToken(authenticated.session.token);
    const [revokedSession] = await database
      .select({ revokedAt: authSessions.revokedAt })
      .from(authSessions)
      .where(eq(authSessions.id, createdSession.id))
      .limit(1);
    assert(revokedSession?.revokedAt, "Sign out should revoke the server session.");

    console.log("Signed wallet message verification passed", {
      mechanism: "SEP-53 arbitrary message signing",
      domain: configValues.homeDomain,
      validSignature: true,
      wrongSignerRejected: true,
      alteredMessageRejected: true,
      addressMismatchRejected: true,
      domainMismatchRejected: true,
      expiredChallengeRejected: true,
      replayRejected: true,
      challengeConsumed: true,
      sessionCreated: true,
      authenticatedMissionUser: true,
      signOutRevokedSession: true,
      transactionSubmitted: false,
      xlmRequired: false,
    });
  } finally {
    if (createdUserId) {
      await database.delete(missionSubmissions).where(eq(missionSubmissions.userId, createdUserId));
      await database.delete(authSessions).where(eq(authSessions.userId, createdUserId));
      await database.delete(stellarWallets).where(eq(stellarWallets.userId, createdUserId));
      await database.delete(users).where(eq(users.id, createdUserId));
    }

    if (challengeHashes.length > 0) {
      await database.delete(authChallenges).where(inArray(authChallenges.challengeHash, challengeHashes));
    }
  }
}

verify().catch((error) => {
  console.error("Signed wallet message verification failed.");
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
});
