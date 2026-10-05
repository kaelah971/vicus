/**
 * Seed-only content used by scripts/seed.ts. Runtime route reads come from Neon
 * through src/lib/data; this file is not a database fallback.
 */

export type CircleState = "education" | "source-review" | "community";

export type CircleAvailability = {
  watch: "available";
  learn: "available";
  role: "available" | "not-wired";
};

export type MissionPreview = {
  title: string;
  description: string;
  type: string;
  review: string;
  reward: string;
};

export type StellarSeedConfig = {
  network?: string;
  assetCode?: string;
  issuerAccount?: string;
  contractId?: string;
  verificationMode?: string;
  verificationSourceUrl?: string;
};

export type Circle = {
  slug: string;
  name: string;
  code: string;
  network: string;
  category: string;
  state: CircleState;
  stateLabel: string;
  summary: string;
  description: string;
  intendedUse: string;
  eligibilityNote: string;
  riskNote: string;
  issuerSource: string;
  sourceStatus: string;
  sourceUrl: string;
  sourceLabel: string;
  lastVerified: string;
  availability: CircleAvailability;
  actions: string[];
  mission: MissionPreview | null;
  stellar?: StellarSeedConfig;
};

const generalSourceUrl = "https://stellar.org/learn/tokenized-investment-assets";

export const circles: Circle[] = [
  {
    slug: "usdc-on-stellar",
    name: "USDC on Stellar",
    code: "USDC",
    network: "Stellar",
    category: "Stablecoin education",
    state: "source-review",
    stateLabel: "Source review",
    summary: "A watch-first circle for learning how a dollar-denominated token is represented in Stellar asset ecosystems.",
    description:
      "Explore the language, role, and source material around USDC on Stellar. This static entry is educational; current availability and terms should always be confirmed with official sources.",
    intendedUse:
      "Build context before deciding whether a Stellar asset or community action is relevant to you.",
    eligibilityNote:
      "A read-only mainnet check can distinguish the canonical USDC trustline and holder roles. It does not prove wallet ownership, and the pasted address is not saved.",
    riskNote:
      "This is educational content, not financial advice. Asset access, restrictions, and risks vary by issuer and region.",
    issuerSource: "Issuer source review pending",
    sourceStatus: "Circle source",
    sourceUrl: "https://www.circle.com/multi-chain-usdc/stellar",
    sourceLabel: "Circle USDC on Stellar",
    lastVerified: "Not verified in this static shell",
    availability: { watch: "available", learn: "available", role: "available" },
    stellar: {
      network: "mainnet",
      assetCode: "USDC",
      issuerAccount: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      verificationMode: "classic-asset",
      verificationSourceUrl: "https://www.circle.com/multi-chain-usdc/stellar",
    },
    actions: ["Read the Passport", "Watch circle", "Review source material", "Verify your role"],
    mission: {
      title: "Understand USDC on Stellar",
      description:
        "Read the Passport and check what the asset represents, what it does not promise, and which eligibility and risk notes matter.",
      type: "quiz",
      review: "Automatic grading",
      reward: "No reward configured",
    },
  },
  {
    slug: "pyusd-on-stellar",
    name: "PYUSD on Stellar",
    code: "PYUSD",
    network: "Stellar",
    category: "Stablecoin education",
    state: "source-review",
    stateLabel: "Source review",
    summary: "An education-first circle for exploring how PYUSD is described in a Stellar context.",
    description:
      "Use this circle to orient yourself around the asset and its source material. It does not represent issuer approval, access, or a live campaign.",
    intendedUse:
      "Compare the asset's stated purpose and restrictions with the official material before taking a next step.",
    eligibilityNote:
      "No wallet, balance, trustline, or role lookup is performed in the static shell.",
    riskNote:
      "This is educational content, not financial advice. Availability and eligibility depend on official sources and applicable restrictions.",
    issuerSource: "Issuer source review pending",
    sourceStatus: "PayPal source; contract lookup deferred",
    sourceUrl: "https://developer.paypal.com/community/blog/pyusd-on-stellar/",
    sourceLabel: "PayPal PYUSD on Stellar",
    lastVerified: "Not verified in this static shell",
    availability: { watch: "available", learn: "available", role: "not-wired" },
    stellar: {
      network: "mainnet",
      assetCode: "PYUSD",
      issuerAccount: "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5",
      verificationMode: "sac-deferred",
      verificationSourceUrl: "https://developer.paypal.com/community/blog/pyusd-on-stellar/",
    },
    actions: ["Read the Passport", "Watch circle", "Review source material"],
    mission: {
      title: "Find the important qualifier",
      description:
        "Use the Passport's eligibility and risk notes to identify what still needs source confirmation.",
      type: "Proof of understanding",
      review: "Not connected",
      reward: "No reward configured",
    },
  },
  {
    slug: "usdy-on-stellar",
    name: "USDY on Stellar",
    code: "USDY",
    network: "Stellar",
    category: "Treasury education",
    state: "source-review",
    stateLabel: "Source review",
    summary: "A focused learning circle for understanding a treasury-oriented tokenized asset on Stellar.",
    description:
      "Start with the asset's stated representation and intended use. This fixture intentionally avoids yield, balance, access, or endorsement claims.",
    intendedUse:
      "Learn the vocabulary around tokenized treasury assets before deciding what participation could mean.",
    eligibilityNote:
      "This entry has no live issuer or wallet connection. Future eligibility will be issuer- and campaign-dependent.",
    riskNote:
      "This is educational content, not financial advice. Do not read this fixture as a purchase or return opportunity.",
    issuerSource: "Issuer source review pending",
    sourceStatus: "Stellar source; identifier review pending",
    sourceUrl: "https://stellar.org/press/ondo-finance-launches-usdy-on-stellar",
    sourceLabel: "Stellar USDY launch announcement",
    lastVerified: "Not verified in this static shell",
    availability: { watch: "available", learn: "available", role: "not-wired" },
    stellar: {
      network: "mainnet",
      assetCode: "USDY",
      verificationMode: "unsupported",
      verificationSourceUrl: "https://stellar.org/press/ondo-finance-launches-usdy-on-stellar",
    },
    actions: ["Read the Passport", "Watch circle", "Review source material"],
    mission: {
      title: "Separate representation from promise",
      description:
        "Read the educational notes and keep the asset's representation separate from any return expectation.",
      type: "Proof of understanding",
      review: "Not connected",
      reward: "No reward configured",
    },
  },
  {
    slug: "tokenized-treasury-education",
    name: "Tokenized Treasury Education",
    code: "Education",
    network: "Stellar",
    category: "RWA education",
    state: "education",
    stateLabel: "Education only",
    summary: "A watch-only learning circle for the language, sources, and questions around tokenized treasuries.",
    description:
      "A category-level space for learning without attaching the page to a specific asset, issuer, yield, balance, or campaign.",
    intendedUse:
      "Build a shared vocabulary for tokenized treasury assets and the questions that should be answered by primary sources.",
    eligibilityNote:
      "There is no asset eligibility or wallet role to verify on this education-only entry.",
    riskNote:
      "Educational material can inform questions but cannot replace official disclosures or professional advice.",
    issuerSource: "No issuer attached",
    sourceStatus: "Education entry",
    sourceUrl: generalSourceUrl,
    sourceLabel: "Stellar tokenized asset overview",
    lastVerified: "Not verified in this static shell",
    availability: { watch: "available", learn: "available", role: "not-wired" },
    actions: ["Read the Passport", "Watch circle", "Review source material"],
    mission: {
      title: "Build a better question",
      description:
        "Choose one question a primary source should answer before a learner treats an asset description as complete.",
      type: "Reflection prompt",
      review: "Not connected",
      reward: "No reward configured",
    },
  },
];

export const circleCategories = Array.from(
  new Set(circles.map((circle) => circle.category)),
);

export const circleStates = Array.from(
  new Set(circles.map((circle) => circle.stateLabel)),
);

export function getCircleBySlug(slug: string) {
  return circles.find((circle) => circle.slug === slug);
}
