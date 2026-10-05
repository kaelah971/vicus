import { Networks } from "@stellar/stellar-sdk";

const DEFAULT_APP_URL = "http://localhost:3000";
const CHALLENGE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export type VicusAuthConfig = {
  appUrl: string;
  homeDomain: string;
  network: "mainnet";
  networkPassphrase: typeof Networks.PUBLIC;
  challengeTtlSeconds: number;
  sessionTtlSeconds: number;
};

function configuredDomain(value: string | undefined, fallback: string) {
  const domain = value?.trim() || fallback;

  if (!domain || domain.length > 255 || /\s/.test(domain) || domain.includes("/")) {
    throw new AuthConfigurationError("Vicus auth domain configuration is invalid.");
  }

  return domain;
}

export function getVicusAuthConfig(): VicusAuthConfig {
  const appUrl = process.env.VICUS_APP_URL?.trim() || DEFAULT_APP_URL;
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new AuthConfigurationError("VICUS_APP_URL must be a valid absolute URL.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new AuthConfigurationError("VICUS_APP_URL must use http or https.");
  }

  if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    throw new AuthConfigurationError("VICUS_APP_URL must use https in production.");
  }

  if (!parsedUrl.hostname) {
    throw new AuthConfigurationError("VICUS_APP_URL must include a hostname.");
  }

  return {
    appUrl: appUrl.replace(/\/$/, ""),
    homeDomain: configuredDomain(process.env.VICUS_HOME_DOMAIN, parsedUrl.hostname),
    network: "mainnet",
    networkPassphrase: Networks.PUBLIC,
    challengeTtlSeconds: CHALLENGE_TTL_SECONDS,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
  };
}
