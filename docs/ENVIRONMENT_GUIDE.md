# Environment Guide

## Required Application Variables

The following variables are required for local/CI/runtime validation:

- `NEXT_PUBLIC_APP_RUNTIME_MODE`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BASE_PATH`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_AUTH_API_BASE_URL`
- `NEXT_PUBLIC_REQUEST_TIMEOUT_MS`
- `NEXT_PUBLIC_ENABLE_DEBUG_LOGS`
- `NEXT_PUBLIC_ENABLE_MOCK_REPOSITORIES`

## Local Files

- `.env.local`
- `.env.stage`
- `.env.production`
- `.env.example` (template)

## Validation

```bash
npm run check:env
```

If validation fails, add missing variables to your active `.env.*` file or export them in CI.

## Security Notes

- Do not commit secret values to git.
- Keep only non-secret defaults in tracked env templates.
- Use secret managers and CI environment secrets for sensitive values.
