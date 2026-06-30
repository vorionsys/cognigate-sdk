---
"@vorionsys/cognigate-sdk": patch
---

Bump `@vorionsys/shared-constants` dependency to `^2.0.0`. The 2.0.0 major only removed the unused `manifest` export and added `tier-reconciliation`; the SDK re-exports only tier symbols (`TrustTier`, `TIER_THRESHOLDS`, `scoreToTier`, `getTierName`, `getTierColor`, `TierThreshold`), so there is no API change.
