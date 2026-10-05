import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { missionSubmissions, missions, users } from "../src/db/schema";
import { getAdminSubmissionQueue } from "../src/lib/data/missions";
import { getCircleBySlug } from "../src/lib/data/circles";
import { getUserProfileByHandle } from "../src/lib/data/profiles";
import { parseMissionConfig } from "../src/lib/missions/config";
import { MissionActionError } from "../src/lib/missions/errors";
import { reviewMissionSubmission, submitMission } from "../src/lib/missions/service";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const database = drizzle(neon(databaseUrl));
const missionIds = [
  "00000000-0000-0000-0000-000000000401",
  "00000000-0000-0000-0000-000000000402",
  "00000000-0000-0000-0000-000000000406",
];

let verificationUserId = "";

async function clearDemoSubmissions(userId: string) {
  await database
    .delete(missionSubmissions)
    .where(
      and(eq(missionSubmissions.userId, userId), inArray(missionSubmissions.missionId, missionIds)),
    );
}

async function expectDuplicate() {
  try {
    await submitMission(missionIds[0], {
      answers: {
        represents: "A dollar-denominated token represented in a Stellar asset ecosystem",
        "does-not-represent": "A guarantee of investment returns or universal access",
        eligibility: "Access and eligibility can depend on official sources, issuer rules, and region",
        risk: "Educational content is not financial advice, and asset access and risks vary",
      },
    }, verificationUserId);
    assert.fail("The one-per-user duplicate rule did not reject the second quiz submission.");
  } catch (error) {
    assert(error instanceof MissionActionError);
    assert.equal(error.code, "duplicate-submission");
  }
}

async function verify() {
  const [participant] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, "demo"))
    .limit(1);
  assert(participant, "The seeded demo participant is required for mission verification.");

  await clearDemoSubmissions(participant.id);
  verificationUserId = participant.id;

  try {
    const missionRows = await database
      .select()
      .from(missions)
      .where(inArray(missions.id, missionIds));
    const quiz = missionRows.find((mission) => mission.type === "quiz");
    const text = missionRows.find((mission) => mission.type === "text");
    const research = missionRows.find((mission) => mission.type === "research");
    assert(quiz && text && research, "The seeded quiz and manual missions are required.");

    const quizConfig = parseMissionConfig(quiz.missionConfig);
    assert(quizConfig?.kind === "quiz", "The seeded quiz configuration is invalid.");
    const incorrectAnswers = Object.fromEntries(
      quizConfig.questions.map((question) => [question.id, question.choices.find((choice) => choice !== question.correctAnswer) ?? ""]),
    );
    const failedQuiz = await submitMission(quiz.id, { answers: incorrectAnswers }, participant.id);
    assert.equal(failedQuiz.submission.status, "needs_revision");
    assert.equal(failedQuiz.pointsAwarded, 0);

    const failedProfile = await getUserProfileByHandle("demo");
    assert(failedProfile, "The demo profile should remain available after a failed quiz.");
    assert.equal(failedProfile.approvedPoints, 0);

    const correctAnswers = Object.fromEntries(
      quizConfig.questions.map((question) => [question.id, question.correctAnswer]),
    );
    const passedQuiz = await submitMission(quiz.id, { answers: correctAnswers }, participant.id);
    assert.equal(passedQuiz.submission.status, "approved");
    assert.equal(passedQuiz.pointsAwarded, quiz.points);
    await expectDuplicate();

    const textSubmission = await submitMission(text.id, {
      content:
        "USDC on Stellar is a dollar-denominated token represented in a Stellar asset ecosystem. The Passport does not promise universal access, issuer approval for every visitor, financial advice, or a guaranteed return. Eligibility and risk context should be checked against official sources.",
      evidenceUrl: "https://www.circle.com/multi-chain-usdc/stellar",
    }, participant.id);
    assert.equal(textSubmission.submission.status, "pending");

    const needsRevision = await reviewMissionSubmission(
      textSubmission.submission.id,
      "needs_revision",
      "Add one concrete source-backed boundary.",
      participant.id,
    );
    assert.equal(needsRevision.submission.status, "needs_revision");

    const revisedText = await submitMission(text.id, {
      content:
        "USDC on Stellar is a dollar-denominated token represented in a Stellar asset ecosystem. It does not promise universal access, issuer approval for every visitor, financial advice, or a guaranteed return. Eligibility and risk context can vary by official source, issuer rules, and region, so the Passport points learners back to primary material.",
      evidenceUrl: "https://www.circle.com/multi-chain-usdc/stellar",
    }, participant.id);
    assert.equal(revisedText.submission.status, "pending");

    const approvedText = await reviewMissionSubmission(
      revisedText.submission.id,
      "approved",
      "",
      participant.id,
    );
    assert.equal(approvedText.submission.status, "approved");
    assert.equal(approvedText.pointsAwarded, text.points);

    const updatedCircle = await getCircleBySlug("usdc-on-stellar", participant.id);
    assert(updatedCircle, "The USDC circle should remain available after submission review.");
    const updatedTextMission = updatedCircle.missions.find((mission) => mission.id === text.id);
    assert.equal(updatedTextMission?.submissionStatus, "approved");

    const researchSubmission = await submitMission(research.id, {
      content:
        "Which primary source should explain the eligibility boundary and risk context for a tokenized treasury asset before a learner treats its description as complete?",
      evidenceUrl: "https://stellar.org/learn/tokenized-investment-assets",
    }, participant.id);
    assert.equal(researchSubmission.submission.status, "pending");
    const rejectedResearch = await reviewMissionSubmission(
      researchSubmission.submission.id,
      "rejected",
      "Use a source specific to the asset rather than a category overview.",
      participant.id,
    );
    assert.equal(rejectedResearch.submission.status, "rejected");
    assert.equal(rejectedResearch.pointsAwarded, 0);

    const profile = await getUserProfileByHandle("demo");
    assert(profile, "The demo profile should expose participation history.");
    assert.equal(profile.approvedPoints, quiz.points + text.points);
    assert(profile.contributions.some((contribution) => contribution.status === "approved"));
    assert(profile.contributions.some((contribution) => contribution.status === "rejected"));
    assert.equal((await getAdminSubmissionQueue()).length, 0);

    console.log("Mission flow verification passed", {
      quizFailedWithoutPoints: true,
      quizApproved: true,
      textPendingNeedsRevisionApproved: true,
      researchRejected: true,
      duplicateRule: true,
      circleStateUpdated: true,
      approvedPoints: profile.approvedPoints,
    });
  } finally {
    await clearDemoSubmissions(participant.id);
  }
}

verify().catch((error) => {
  console.error("Mission flow verification failed.");
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
});
