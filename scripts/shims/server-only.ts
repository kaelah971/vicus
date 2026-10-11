// Server-side script shim: scripts run in Node (always server-side), so the
// Next.js "server-only" guard is a no-op here. Scoped to script runs via
// scripts/tsconfig.verify.json; the Next build still resolves the real package.
export {};
