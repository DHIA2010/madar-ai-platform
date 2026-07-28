# FEATURE_FLAGS_GUIDE

## Scope
Feature flags are introduced as a platform capability, not as product logic.

## Implemented Components
- `FeatureFlagProvider` port
- `EnvironmentFeatureFlagProvider`
- `feature_flags` table for future scoped overrides

## Supported Today
- boolean flags
- environment-backed defaults

## Design Ready For
- per-workspace overrides
- rollout percentages
- durable storage-backed evaluation

## Policy
Application code should consume feature flags through the provider abstraction, never directly from environment variables.
