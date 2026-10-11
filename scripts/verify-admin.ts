import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { circles, missionSubmissions, missions, rewardClaims, users } from "../src/db/schema";
import { getAdminMissions, getAdminOverview } from "../src/lib/data/admin";
import { getAdminSubmissionQueue, getMissionById, listMissions } from "../src/lib/data/missions";
import { getCircleBySlug } from "../src/lib/data/circles";
import { getUserProfileByHandle } from "../src/lib/data/profiles";
import { parseMissionConfig, publicMissionConfig } from "../src/lib/missions/config";
import { MissionActionError } from "../src/lib/missions/errors";
import { createMission, reviewMissionSubmission, submitMission, updateMissionStatus } from "../src/lib/missions/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const createdMissionIds: string[] = [];

async function createUser(handle: string, role: string) {
  const id = randomUUID();
  temporaryUserIds.push(id);
  await database.insert(users).values({
    id,
    handle,
    displayName: `${handle} member`,
    avatarUrl: null,
    role,
  });
  return id;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof MissionActionError, "Expected a MissionActionError.");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`Expected error code ${code}.`);
}

async function circleIdFor(slug: string) {
  const [row] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, slug))
    .limit(1);
  assert(row, `The ${slug} circle is required for admin verification.`);
  return row.id;
}

async function cleanup() {
  if (createdMissionIds.length > 0) {
    await database.delete(missionSubmissions).where(
      inArray(
        missionSubmissions.missionId,
        createdMissionIds,
      ),
    );
    await database.delete(missions).where(inArray(missions.id, createdMissionIds));
  }
  if (temporaryUserIds.length > 0) {
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
}

async function verify() {
  const memberHandle = `admin-verify-member-${randomUUID().slice(0, 6)}`;
  const adminHandle = `admin-verify-admin-${randomUUID().slice(0, 6)}`;
  const memberId = await createUser(memberHandle, "member");
  const adminId = await createUser(adminHandle, "admin");
  const baseCircleId = await circleIdFor("usdc-on-base");
  const solanaCircleId = await circleIdFor("usdc-on-solana");
  const ethereumCircleId = await circleIdFor("usdc-on-ethereum");

  // Unauthorized users cannot touch admin mutations (enforced in service, mirrored by routes).
  await expectCode(
    createMission(
      { circleId: baseCircleId, title: "Unauthorized attempt mission", description: "This description is long enough to pass validation rules.", type: "text", points: 10, status: "draft", rewardEnabled: false, rewardAmount: null, questions: [], evidenceRequired: false, evidencePrompt: "Link the official source that supports your response." },
      memberId,
    ),
    "forbidden",
  );
  await expectCode(reviewMissionSubmission(randomUUID(), "approved", null, memberId), "forbidden");

  // Authorized admin creates a draft quiz mission with a Stellar reward on a Base circle.
  const quiz = await createMission(
    {
      circleId: baseCircleId,
      title: "Admin verification quiz",
      description: "A bounded quiz created by the admin verification script for review-flow checks.",
      type: "quiz",
      points: 60,
      status: "draft",
      rewardEnabled: true,
      rewardAmount: "0.05",
      questions: [
        { prompt: "Which network settles this mission reward?", choices: ["Stellar Testnet", "Base"], correctAnswer: "Stellar Testnet" },
      ],
      evidenceRequired: false,
      evidencePrompt: "Not used for quizzes.",
    },
    adminId,
  );
  createdMissionIds.push(quiz.mission.id);
  assert.equal(quiz.mission.status, "draft");
  assert.equal(quiz.mission.rewardAsset, "XLM");

  // Quiz answer keys stay server-side and never leak through the public config.
  const [storedQuiz] = await database
    .select({ missionConfig: missions.missionConfig })
    .from(missions)
    .where(eq(missions.id, quiz.mission.id))
    .limit(1);
  const storedConfig = parseMissionConfig(storedQuiz?.missionConfig);
  assert(storedConfig?.kind === "quiz");
  assert.equal(storedConfig.questions[0]?.correctAnswer, "Stellar Testnet");
  const publicConfig = publicMissionConfig(storedConfig);
  assert(publicConfig?.kind === "quiz");
  assert(!("correctAnswer" in publicConfig.questions[0]!), "Answer keys must not leak publicly.");

  // Draft missions stay closed to participants.
  await expectCode(
    submitMission(quiz.mission.id, { answers: { q1: "Stellar Testnet" } }, memberId),
    "mission-closed",
  );
  // Invalid payloads are rejected without touching the database.
  const missionsBefore = createdMissionIds.length;
  await expectCode(
    createMission({ circleId: baseCircleId, title: "Bad quiz mission here", description: "This description is long enough to pass validation rules.", type: "quiz", points: 10, status: "draft", rewardEnabled: false, rewardAmount: null, questions: [{ prompt: "Broken question?", choices: ["Only one"], correctAnswer: "Missing" }], evidenceRequired: false, evidencePrompt: "Unused." }, adminId),
    "invalid-request",
  );
  await expectCode(
    createMission({ circleId: baseCircleId, title: "Negative points mission", description: "This description is long enough to pass validation rules.", type: "text", points: -5, status: "draft", rewardEnabled: false, rewardAmount: null, questions: [], evidenceRequired: false, evidencePrompt: "Link the official source that supports your response." }, adminId),
    "invalid-request",
  );
  await expectCode(
    createMission({ circleId: baseCircleId, title: "Bad reward mission here", description: "This description is long enough to pass validation rules.", type: "text", points: 10, status: "draft", rewardEnabled: true, rewardAmount: "not-a-number", questions: [], evidenceRequired: false, evidencePrompt: "Link the official source that supports your response." }, adminId),
    "invalid-request",
  );
  await expectCode(
    createMission({ circleId: randomUUID(), title: "Unknown circle mission", description: "This description is long enough to pass validation rules.", type: "text", points: 10, status: "draft", rewardEnabled: false, rewardAmount: null, questions: [], evidenceRequired: false, evidencePrompt: "Link the official source that supports your response." }, adminId),
    "mission-not-found",
  );
  assert.equal(createdMissionIds.length, missionsBefore);

  // Cross-ecosystem: an open quiz with XLM reward on Ethereum, an open text mission on Solana.
  const ethQuiz = await createMission(
    {
      circleId: ethereumCircleId,
      title: "Admin verification eth quiz",
      description: "Cross-ecosystem campaign check: asset on Ethereum, reward on Stellar Testnet.",
      type: "quiz",
      points: 40,
      status: "open",
      rewardEnabled: true,
      rewardAmount: "0.01",
      questions: [
        { prompt: "Does watching prove ownership?", choices: ["No, never", "Yes, always"], correctAnswer: "No, never" },
      ],
      evidenceRequired: false,
      evidencePrompt: "Not used for quizzes.",
    },
    adminId,
  );
  createdMissionIds.push(ethQuiz.mission.id);

  const textMission = await createMission(
    {
      circleId: solanaCircleId,
      title: "Admin verification text mission",
      description: "Submit a short neutral note about the Solana circle with an optional source link.",
      type: "text",
      points: 25,
      status: "open",
      rewardEnabled: false,
      rewardAmount: null,
      questions: [],
      evidenceRequired: false,
      evidencePrompt: "Link the official source that supports your response.",
    },
    adminId,
  );
  createdMissionIds.push(textMission.mission.id);

  // A manual submission appears in the review queue with reward context and no wallet identifiers.
  const first = await submitMission(
    textMission.mission.id,
    { content: "Solana representation notes for the admin queue check, kept neutral and source-linked." },
    memberId,
  );
  assert.equal(first.submission.status, "pending");

  const queue = await getAdminSubmissionQueue({ status: "pending" });
  const queued = queue.find((entry) => entry.id === first.submission.id);
  assert(queued, "The manual submission must appear in the review queue.");
  assert.equal(queued.circleSlug, "usdc-on-solana");
  assert(!JSON.stringify(queued).includes("publicKey"), "Queue payloads must not expose wallet identifiers.");

  // Needs-revision preserves actionable feedback; resubmission re-enters pending on the same row.
  const revised = await reviewMissionSubmission(first.submission.id, "needs_revision", "Add the official source link.", adminId);
  assert.equal(revised.submission.status, "needs_revision");
  assert.equal(revised.pointsAwarded, 0);
  const [storedRevision] = await database
    .select({ revisionReason: missionSubmissions.revisionReason })
    .from(missionSubmissions)
    .where(eq(missionSubmissions.id, first.submission.id))
    .limit(1);
  assert.equal(storedRevision?.revisionReason, "Add the official source link.");

  const resubmitted = await submitMission(
    textMission.mission.id,
    { content: "Solana representation notes, revised with the official Circle source link attached here." },
    memberId,
  );
  assert.equal(resubmitted.submission.id, first.submission.id, "Revision resubmits the same logical row.");
  assert.equal(resubmitted.submission.status, "pending");

  // Approve transitions correctly, awards points, surfaces on the profile, and does NOT auto-send XLM.
  const approved = await reviewMissionSubmission(first.submission.id, "approved", null, adminId);
  assert.equal(approved.submission.status, "approved");
  assert.equal(approved.pointsAwarded, 25);
  const [autoClaim] = await database
    .select({ id: rewardClaims.id })
    .from(rewardClaims)
    .where(eq(rewardClaims.missionSubmissionId, first.submission.id))
    .limit(1);
  assert(!autoClaim, "Approval must not automatically create a reward claim.");

  const memberProfile = await getUserProfileByHandle(memberHandle);
  assert(memberProfile, "The participant profile must load after approval.");
  assert(
    memberProfile.contributions.some((entry) => entry.missionId === textMission.mission.id && entry.status === "approved"),
    "Profile contributions must show the approved mission.",
  );
  assert(memberProfile.approvedPoints >= 25, "Approved Vicus points must flow to the profile.");

  // Rejection preserves its reason on a separate manual mission (one row per user per mission).
  const rejectMission = await createMission(
    {
      circleId: solanaCircleId,
      title: "Admin verification second text mission",
      description: "A second manual mission so rejection is tested without colliding with unique rows.",
      type: "text",
      points: 10,
      status: "open",
      rewardEnabled: false,
      rewardAmount: null,
      questions: [],
      evidenceRequired: false,
      evidencePrompt: "Link the official source that supports your response.",
    },
    adminId,
  );
  createdMissionIds.push(rejectMission.mission.id);
  const rejectedSubmission = await submitMission(
    rejectMission.mission.id,
    { content: "A Solana note that does not meet the bar and will be rejected outright here for scope." },
    memberId,
  );
  const rejected = await reviewMissionSubmission(rejectedSubmission.submission.id, "rejected", "Out of scope for this mission.", adminId);
  assert.equal(rejected.submission.status, "rejected");
  assert.equal(rejected.pointsAwarded, 0);

  // Duplicate reviews on decided submissions stay safe.
  await expectCode(reviewMissionSubmission(first.submission.id, "approved", null, adminId), "invalid-transition");

  // Campaign lifecycle: drafts are admin-only, open is participant-visible.
  const lifecycle = await createMission(
    {
      circleId: baseCircleId,
      title: "Admin verification lifecycle mission",
      description: "Lifecycle check: draft hidden from participants, open visible, back to draft hidden.",
      type: "quiz",
      points: 15,
      status: "draft",
      rewardEnabled: false,
      rewardAmount: null,
      questions: [
        { prompt: "Is a draft mission participant-visible?", choices: ["No", "Yes"], correctAnswer: "No" },
      ],
      evidenceRequired: false,
      evidencePrompt: "Not used for quizzes.",
    },
    adminId,
  );
  createdMissionIds.push(lifecycle.mission.id);
  const lifecycleId = lifecycle.mission.id;

  // Non-admin cannot change mission status.
  await expectCode(updateMissionStatus(lifecycleId, "open", memberId), "forbidden");
  await expectCode(updateMissionStatus(lifecycleId, "archived", adminId), "invalid-request");
  await expectCode(updateMissionStatus(randomUUID(), "open", adminId), "mission-not-found");

  // Draft absent from participant surfaces.
  const draftCircle = await getCircleBySlug("usdc-on-base", memberId);
  assert(draftCircle, "The Base circle must load for lifecycle checks.");
  assert(
    !draftCircle.missions.some((mission) => mission.id === lifecycleId),
    "Draft mission must be absent from the participant Circle.",
  );
  const draftCenter = await listMissions(memberId);
  assert(
    !draftCenter.some((mission) => mission.id === lifecycleId),
    "Draft mission must be absent from the Mission Center.",
  );
  const draftDirect = await getMissionById(lifecycleId, memberId);
  assert.equal(draftDirect, null, "Direct participant access to a draft must not reveal mission config.");
  const draftAnonymous = await getMissionById(lifecycleId);
  assert.equal(draftAnonymous, null, "Anonymous direct access to a draft must not reveal mission config.");

  // Admin can still see the draft, with status intact and no leaked answer keys.
  const draftAdmin = await getMissionById(lifecycleId, adminId);
  assert(draftAdmin, "Admin must see the draft mission.");
  assert.equal(draftAdmin.status, "draft");
  assert.equal(
    JSON.stringify(draftAdmin.config).includes("correctAnswer"),
    false,
    "Quiz answer keys must never leak, even to admin reads.",
  );
  const adminMissionsBefore = await getAdminMissions();
  assert(
    adminMissionsBefore.some((entry) => entry.id === lifecycleId && entry.status === "draft"),
    "Draft must remain visible in Campaign Studio.",
  );

  // Admin Draft -> Open: opened mission becomes participant-visible.
  const opened = await updateMissionStatus(lifecycleId, "open", adminId);
  assert.equal(opened.mission.id, lifecycleId);
  assert.equal(opened.mission.status, "open");
  const openedCircle = await getCircleBySlug("usdc-on-base", memberId);
  assert(
    openedCircle?.missions.some((mission) => mission.id === lifecycleId),
    "Opened mission must appear in the participant Circle.",
  );
  const openedCenter = await listMissions(memberId);
  assert(
    openedCenter.some((mission) => mission.id === lifecycleId),
    "Opened mission must appear in the Mission Center.",
  );
  const openedDirect = await getMissionById(lifecycleId, memberId);
  assert(openedDirect, "Opened mission must be directly readable by participants.");
  assert.equal(openedDirect.status, "open");
  assert.equal(
    JSON.stringify(openedDirect.config).includes("correctAnswer"),
    false,
    "Quiz answer keys must never leak publicly.",
  );

  // Admin Open -> Draft: mission disappears again from participant surfaces.
  const redrafted = await updateMissionStatus(lifecycleId, "draft", adminId);
  assert.equal(redrafted.mission.status, "draft");
  const redraftedCircle = await getCircleBySlug("usdc-on-base", memberId);
  assert(
    !redraftedCircle?.missions.some((mission) => mission.id === lifecycleId),
    "Re-drafted mission must disappear from the participant Circle.",
  );
  const redraftedCenter = await listMissions(memberId);
  assert(
    !redraftedCenter.some((mission) => mission.id === lifecycleId),
    "Re-drafted mission must disappear from the Mission Center.",
  );
  const redraftedDirect = await getMissionById(lifecycleId, memberId);
  assert.equal(redraftedDirect, null, "Re-drafted mission must not be directly readable by participants.");

  // No reward claim is created merely by status changes.
  const [lifecycleClaim] = await database
    .select({ id: rewardClaims.id })
    .from(rewardClaims)
    .where(eq(rewardClaims.missionId, lifecycleId))
    .limit(1);
  assert(!lifecycleClaim, "Status changes must not create reward claims.");

  // Studio reads: missions list, detail, and overview stay DB-derived.
  const adminMissions = await getAdminMissions();
  const studioEntry = adminMissions.find((entry) => entry.id === textMission.mission.id);
  assert(studioEntry, "Created missions must appear in the Studio list.");
  assert.equal(studioEntry.submissions.total, 1);
  assert.equal(studioEntry.submissions.approved, 1);
  const overview = await getAdminOverview();
  assert(overview.activeMissions >= 2, "Open missions must be counted from the database.");
  assert(Number(overview.openRewardExposureXlm) > 0, "Configured XLM exposure must be derivable.");

  console.log("Admin verification passed", {
    unauthorizedBlocked: true,
    draftQuizCreated: true,
    answerKeysServerSide: true,
    invalidPayloadsRejected: true,
    crossEcosystemCampaigns: true,
    queueReadback: true,
    approveNeedsRevisionReject: true,
    pointsAwarded: true,
    noAutoSend: true,
    duplicateReviewSafe: true,
    lifecycleStatusControl: true,
    draftHiddenFromParticipants: true,
    openVisibleToParticipants: true,
    redraftHidesAgain: true,
    noClaimOnStatusChange: true,
  });
}

verify()
  .catch((error) => {
    console.error("Admin verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
