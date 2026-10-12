-- Canonical asset-class values in circles.category. Education-only content keeps
-- its existing category and stays out of asset discovery via its status.
UPDATE "circles" SET "category" = 'stablecoin' WHERE "slug" IN ('usdc-on-stellar', 'usdc-on-base', 'usdc-on-ethereum', 'usdc-on-solana', 'pyusd-on-stellar');
--> statement-breakpoint
UPDATE "circles" SET "category" = 'treasury_fund' WHERE "slug" = 'usdy-on-stellar';
