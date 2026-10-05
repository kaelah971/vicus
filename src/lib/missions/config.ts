import type {
  PublicMissionConfig,
  StoredMissionConfig,
  StoredQuizConfig,
  StoredTextConfig,
} from "@/lib/missions/types";
import type { MissionAvailability } from "@/lib/missions/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseQuizConfig(value: Record<string, unknown>): StoredQuizConfig | null {
  const questions = value.questions;
  const passingScoreValue = value.passingScore;

  if (
    !Array.isArray(questions) ||
    typeof passingScoreValue !== "number" ||
    !Number.isInteger(passingScoreValue) ||
    passingScoreValue < 1
  ) {
    return null;
  }

  const passingScore = passingScoreValue;
  const parsedQuestions = questions.map((question) => {
    if (!isRecord(question)) {
      return null;
    }

    const choices = question.choices;
    if (
      !stringValue(question.id) ||
      !stringValue(question.prompt) ||
      !Array.isArray(choices) ||
      choices.length < 2 ||
      !choices.every(stringValue) ||
      !stringValue(question.correctAnswer) ||
      !choices.includes(question.correctAnswer)
    ) {
      return null;
    }

    return {
      id: question.id,
      prompt: question.prompt,
      choices,
      correctAnswer: question.correctAnswer,
    };
  });

  if (
    parsedQuestions.some((question) => question === null) ||
    parsedQuestions.length === 0 ||
    passingScore > parsedQuestions.length
  ) {
    return null;
  }

  return {
    kind: "quiz",
    passingScore,
    questions: parsedQuestions as StoredQuizConfig["questions"],
  };
}

function parseTextConfig(
  value: Record<string, unknown>,
  kind: "text" | "research",
): StoredTextConfig | null {
  const minLengthValue = value.minLength;
  const maxLengthValue = value.maxLength;
  const evidenceRequired = value.evidenceRequired;
  const evidencePrompt = value.evidencePrompt;

  if (
    typeof minLengthValue !== "number" ||
    !Number.isInteger(minLengthValue) ||
    minLengthValue < 1 ||
    typeof maxLengthValue !== "number" ||
    !Number.isInteger(maxLengthValue) ||
    maxLengthValue < minLengthValue ||
    maxLengthValue > 20_000 ||
    typeof evidenceRequired !== "boolean" ||
    !stringValue(evidencePrompt)
  ) {
    return null;
  }

  return {
    kind,
    minLength: minLengthValue,
    maxLength: maxLengthValue,
    evidenceRequired,
    evidencePrompt,
  };
}

export function parseMissionConfig(value: unknown): StoredMissionConfig | null {
  if (!isRecord(value) || !stringValue(value.kind)) {
    return null;
  }

  if (value.kind === "quiz") {
    return parseQuizConfig(value);
  }

  if (value.kind === "text" || value.kind === "research") {
    return parseTextConfig(value, value.kind);
  }

  return null;
}

export function publicMissionConfig(config: StoredMissionConfig | null): PublicMissionConfig {
  if (!config) {
    return null;
  }

  if (config.kind === "quiz") {
    return {
      kind: "quiz",
      passingScore: config.passingScore,
      questions: config.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        choices: question.choices,
      })),
    };
  }

  return config;
}

export function getMissionAvailability(
  status: string,
  startsAt: Date | null,
  endsAt: Date | null,
  now = new Date(),
): MissionAvailability {
  if (status === "preview") {
    return "preview";
  }

  if (status !== "open") {
    return "closed";
  }

  if (startsAt && startsAt > now) {
    return "scheduled";
  }

  if (endsAt && endsAt <= now) {
    return "closed";
  }

  return "open";
}

export function gradeQuiz(
  config: Extract<StoredMissionConfig, { kind: "quiz" }>,
  answers: Record<string, string>,
) {
  const expectedIds = config.questions.map((question) => question.id);
  const answerIds = Object.keys(answers);
  const hasExactlyExpectedAnswers =
    expectedIds.length === answerIds.length && expectedIds.every((id) => answerIds.includes(id));

  if (
    !hasExactlyExpectedAnswers ||
    answerIds.some((id) => !stringValue(answers[id])) ||
    config.questions.some((question) => !question.choices.includes(answers[question.id]))
  ) {
    return null;
  }

  const correctCount = config.questions.reduce(
    (total, question) => total + (answers[question.id] === question.correctAnswer ? 1 : 0),
    0,
  );
  const score = Math.round((correctCount / config.questions.length) * 100);

  return {
    correctCount,
    total: config.questions.length,
    score,
    passed: correctCount >= config.passingScore,
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
