# Configuration Guide

## Objective
Centralize typed backend configuration and remove scattered environment reads over time.

## Source

- `src/backend-foundation/configuration.ts`
- existing identity config: `src/identity-platform/configuration/index.ts`

## Foundation Configuration Fields

- `BACKEND_ENVIRONMENT` (`local|docker|stage|production`)
- `BACKEND_APP_NAME`
- `BACKEND_APP_VERSION`
- `BACKEND_BUILD_SHA`
- `BACKEND_FEATURE_FLAGS` (JSON object of boolean flags)

## Environment Strategy

1. Local
- defaults from typed schema.

2. Docker
- values injected from compose env and `.env.local`.

3. Stage/Production
- explicit environment variables with immutable build metadata.

## Secrets and Feature Flags

- Module-specific secrets remain in module config (identity currently).
- Foundation config now provides cross-module feature flag envelope.

## Validation Approach

- zod parsing at bootstrap stage.
- fail-fast behavior for invalid inputs.

## Next Consolidation Steps

1. Move all backend runtime env reads behind typed loaders.
2. Introduce secret-provider abstraction for cloud secret managers.
3. Enforce config snapshot logging (excluding secrets) on startup.
