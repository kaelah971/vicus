export const submissionStatuses = [
  "pending",
  "approved",
  "rejected",
  "needs_revision",
] as const;

export type SubmissionStatus = (typeof submissionStatuses)[number];
export type MissionAvailability = "open" | "scheduled" | "closed" | "preview";

export type StoredQuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  correctAnswer: string;
};

export type StoredQuizConfig = {
  kind: "quiz";
  passingScore: number;
  questions: StoredQuizQuestion[];
};

export type StoredTextConfig = {
  kind: "text" | "research";
  minLength: number;
  maxLength: number;
  evidenceRequired: boolean;
  evidencePrompt: string;
};

export type StoredOnchainActionConfig = {
  kind: "onchain_action";
  network: "stellar_mainnet";
  action: "payment";
  assetCode: string;
  assetIssuer: string;
  minimumAmount: string;
  proofNotBefore: string;
};

export type StoredMissionConfig = StoredQuizConfig | StoredTextConfig | StoredOnchainActionConfig;

export type PublicQuizQuestion = Omit<StoredQuizQuestion, "correctAnswer">;

export type PublicMissionConfig =
  | {
      kind: "quiz";
      passingScore: number;
      questions: PublicQuizQuestion[];
    }
  | {
      kind: "text" | "research";
      minLength: number;
      maxLength: number;
      evidenceRequired: boolean;
      evidencePrompt: string;
    }
  | {
      kind: "onchain_action";
      network: "Stellar Mainnet";
      assetCode: string;
      minimumAmount: string;
      proofNotBefore: string;
    }
  | null;

export type SubmissionState = {
  id: string;
  status: SubmissionStatus;
  score: number | null;
  evidenceUrl: string | null;
  revisionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

export type MissionDetailRecord = {
  id: string;
  circle: {
    name: string;
    slug: string;
  };
  type: string;
  title: string;
  description: string;
  points: number;
  rewardNote: string;
  eligibilityNote: string;
  reviewMode: string;
  duplicatePolicy: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  availability: MissionAvailability;
  config: PublicMissionConfig;
  activation: {
    capabilityType: string | null;
  } | null;
  viewer: {
    authenticated: boolean;
    handle: string | null;
  };
  submission: SubmissionState | null;
};

export type SubmissionOutcome = {
  submission: SubmissionState;
  message: string;
  pointsAwarded: number;
};
