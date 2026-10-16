<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:vicus-shipping-policy (owner-required, permanent) -->

# Vicus shipping policy

Every shipped feature must meet these standards. They are cumulative with the Next.js rules above.

1. **README stays current.** Every shipped feature updates README.md: capability table, status key (Live / Implemented / Discovery / Planned), screenshots where visible, current roadmap version. Never leave a stale version or limitation claim behind.
2. **Real screenshots for visible UI.** Meaningful UI changes ship with fresh production screenshots under `docs/screenshots/` + a `CAPTURE_MANIFEST.md` entry (URL, date, viewport, auth/capture conditions). Mobile AND desktop. Real renders only — no fixtures presented as activity, no fabricated balances/charts/participation.
3. **Mobile AND desktop inspected.** 360/375/390/430px + short-height + 768px + 1440px with measured overflow (`scrollWidth` vs `innerWidth`), plus real interaction testing (open/close, expand, Escape, filters, navigation, keyboard) — never build-only verification. No real-device claims from emulation.
4. **Honest capability states.** Code presence is never readiness. Distinguish implemented, Testnet, Mainnet, gated, and witnessed — in UI copy, README, and roadmap. Unknown stays unknown.
5. **Roadmap + state sync.** Every slice updates `docs/VICUS_MASTER_ROADMAP.md` (status + evidence, 43 milestone IDs intact) and `.fast-build/STATE.md` in the same session. Never mark complete on plans or code presence alone.
6. **Production proof.** Runtime changes deploy through the Vicus Vercel project, move the pinned alias, and verify live behavior + data states before the slice is called done.

<!-- END:vicus-shipping-policy -->
