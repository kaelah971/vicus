import { asc, eq } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import { assets, campaigns, circles } from "@/db/schema";
import type { CampaignRecord } from "@/lib/data/types";
import { mapCircle } from "@/lib/data/circles";

export async function getCampaigns(): Promise<CampaignRecord[]> {
  try {
    const database = getDatabase();
    const rows = await database
      .select({ campaign: campaigns, circle: circles, asset: assets })
      .from(campaigns)
      .innerJoin(circles, eq(campaigns.circleId, circles.id))
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .orderBy(asc(campaigns.createdAt));

    return rows.map(({ campaign, circle, asset }) => ({
      id: campaign.id,
      objective: campaign.objective,
      budgetAsset: campaign.budgetAsset,
      budgetAmount: campaign.budgetAmount,
      budgetStatus: campaign.budgetStatus,
      status: campaign.status,
      circle: mapCircle({ circle, asset }),
    }));
  } catch {
    throw toDatabaseUnavailableError("get campaigns");
  }
}
