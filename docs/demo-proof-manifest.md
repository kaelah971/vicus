# Vicus Demo Proof Manifest (Wave 2 complete)

Real identifiers only. Empty fields mean "not yet executed" — never fill them
without a witnessed transaction.

## Proven live reads (agent-executed, no signature required)

- AAPLx quote — Solana Mainnet, 2026-10-13T00:50Z: 25 USDC → 7.297164 AAPLx,
  0% impact. Proves: venue live, mint routable. Tx: n/a (quote only).
- TSLAx quote — Solana Mainnet, 2026-10-13T00:50Z: 25 USDC → 6.659698 TSLAx,
  0% impact. Proves: per-asset routing live, no AAPLx contamination.
- Morpho AAPLc market `0x26d6…` — Base, 2026-10-13: ~$487 liquidity, 3% util,
  LLTV 62.5%. Proves: borrow route live and readable.
- NVDAc Aerodrome quotes (volatile + stable) revert on Base Mainnet.
  Proves: gating is honest, not a UI flag.

## Pending human-signature flows (placeholders)

| Flow | Network | Tx hash | Explorer | Vicus receipt | Status |
|---|---|---|---|---|---|
| Stellar Send | Stellar Mainnet | — | — | — | PENDING HUMAN |
| Cross-chain Send | Stellar→Base Testnet | — | — | — | PENDING HUMAN |
| AAPLx Access | Solana Mainnet | — | — | — | PENDING HUMAN |
| TSLAx Access | Solana Mainnet | — | — | — | PENDING HUMAN |
| AAPLx Exit | Solana Mainnet | — | — | — | PENDING HUMAN |
| Campaign fund+claim | Stellar Testnet | — | — | — | PENDING HUMAN (needs funding) |
| Lab issuance | Stellar Testnet | — | — | — | PENDING HUMAN (needs issuer) |

## Safe gated features (demo as intentional UX, not failures)

Mainnet CCTP off · AAPLc/NVDAc acquisition gated (no liquidity) ·
Return-to-Stellar gated (forwarder/relay boundary) · Solana Send destination
gated · TSLAx/NVDAc execution limited to verified routes.
