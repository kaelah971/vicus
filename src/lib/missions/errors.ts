export type MissionActionErrorCode =
  | "invalid-request"
  | "unauthenticated"
  | "forbidden"
  | "mission-not-found"
  | "mission-closed"
  | "unsupported-mission"
  | "invalid-quiz"
  | "invalid-text"
  | "duplicate-submission"
  | "submission-not-found"
  | "invalid-transition";

export class MissionActionError extends Error {
  constructor(
    public readonly code: MissionActionErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "MissionActionError";
  }
}
