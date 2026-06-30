# @vorionsys/cognigate-sdk

## 1.0.6

### Patch Changes

- 5ac328b: Bump `@vorionsys/shared-constants` dependency to `^2.0.0`. The 2.0.0 major only removed the unused `manifest` export and added `tier-reconciliation`; the SDK re-exports only tier symbols (`TrustTier`, `TIER_THRESHOLDS`, `scoreToTier`, `getTierName`, `getTierColor`, `TierThreshold`), so there is no API change.

## 1.0.5

### Patch Changes

- 86b3fc2: Add npm provenance attestation, trusted publisher configuration, and correct package metadata (homepage, bugs, author, files).
