import type { Circle, MissionPreview } from "@/lib/vicus-data";
import type { SubmissionStatus } from "@/lib/missions/types";
import type { RewardStateView } from "@/lib/rewards/types";

export type CircleVerificationSummary = {
  enabled: boolean;
  mode: string | null;
  network: string | null;
  assetCode: string | null;
  sourceUrl: string | null;
};

export type CircleRecord = Omit<Circle, "mission" | "stellar" | "ecosystem"> & {
  id: string;
  ecosystem: string;
  ecosystemLabel: string;
  watched: boolean;
  mission: MissionRecord | null;
  verification: CircleVerificationSummary;
};

export type MissionRecord = MissionPreview & {
  id: string;
  points: number;
  status: string;
  submissionStatus: SubmissionStatus | null;
  submissionScore: number | null;
};

export type ActivityRecord = {
  id: string;
  label: string;
  title: string;
  detail: string;
};

export type CircleDetail = CircleRecord & {
  missions: MissionRecord[];
  activity: ActivityRecord[];
};

export type ProfileMembership = {
  id: string;
  role: string;
  source: string;
  joinedAt: Date;
  circle: CircleRecord;
};

export type ProfileBadge = {
  id: string;
  badgeType: string;
  metadata: Record<string, unknown>;
  awardedAt: Date;
  circle: CircleRecord | null;
};

export type ProfileContribution = {
  id: string;
  missionId: string;
  missionTitle: string;
  missionType: string;
  circleName: string;
  circleSlug: string;
  status: SubmissionStatus;
  score: number | null;
  points: number;
  submittedAt: Date;
  reviewedAt: Date | null;
  revisionReason: string | null;
};

export type VerifiedRoleSummary = {
  id: string;
  role: string;
  lastState: string;
  ecosystem: string;
  network: string;
  verifiedAt: Date;
  lastCheckedAt: Date;
  circle: CircleRecord;
};

export type UserProfile = {
  user: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    preferredEcosystems: string[];
    assetInterests: string[];
    role: string;
  };
  wallets: Array<{
    id: string;
    network: string;
    publicKey: string;
    verifiedAt: Date;
  }>;
  memberships: ProfileMembership[];
  verifiedRoles: VerifiedRoleSummary[];
  badges: ProfileBadge[];
  contributions: ProfileContribution[];
  rewards: RewardStateView[];
  approvedPoints: number;
};

export type CampaignRecord = {
  id: string;
  objective: string;
  budgetAsset: string | null;
  budgetAmount: string | null;
  budgetStatus: string;
  status: string;
  circle: CircleRecord;
};

export type SubmissionReviewRecord = {
  id: string;
  missionId: string;
  missionTitle: string;
  missionType: string;
  missionPoints: number;
  missionRewardAsset: string | null;
  missionRewardAmount: string | null;
  circleName: string;
  circleSlug: string;
  participantHandle: string;
  participantName: string;
  content: string | null;
  evidenceUrl: string | null;
  score: number | null;
  status: SubmissionStatus;
  revisionReason: string | null;
  submittedAt: string;
  /**
   * Other submissions for the same mission sharing this evidence URL.
   * Advisory only — official doc links are legitimately reused, so the
   * reviewer decides. Absent (org queues) reads as 0.
   */
  duplicateEvidenceCount?: number;
};

export type AdminMissionRecord = {
  id: string;
  title: string;
  type: string;
  status: string;
  points: number;
  rewardAsset: string | null;
  rewardAmount: string | null;
  reviewMode: string;
  createdAt: string;
  circle: CircleRecord;
  submissions: {
    pending: number;
    needsRevision: number;
    approved: number;
    rejected: number;
    total: number;
  };
};

export type AdminSummary = {
  circles: number;
  campaigns: number;
  missions: number;
  memberships: number;
  watchers: number;
  activityEvents: number;
  pendingSubmissions: number;
  approvedSubmissions: number;
  activeMissions: number;
  openRewardExposureXlm: string;
};
