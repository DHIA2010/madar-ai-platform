# MADAR

MADAR is a Next.js 16 application for AI-assisted marketing intelligence workflows.

This repository is deployment-ready from an engineering perspective and includes:
- Frontend application (App Router, TypeScript, Tailwind)
- Terraform infrastructure definitions
- Container build artifacts
- GitHub Actions CI/CD workflows
- Operational and architecture documentation

## Quick Start

Prerequisites:
- Node.js 20+
- npm 10+
- Terraform 1.8+

Commands:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Terraform validation only (no apply):

```bash
terraform fmt -recursive
terraform -chdir=terraform/bootstrap validate
terraform -chdir=terraform/environments/local validate
terraform -chdir=terraform/environments/stage-networking validate
terraform -chdir=terraform/environments/stage validate
terraform -chdir=terraform/environments/stage-platform validate
terraform -chdir=terraform/environments/production validate
```

## Engineering Quality Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run lint:boundaries`
- `npm run check:circular`
- `npm run identity:openapi`
- `npm run project:openapi`
- `npm run identity:migrations:validate`
- `npm run project:migrations:validate`
- `docker compose config -q`
- `terraform fmt -recursive`
- `terraform validate` for each root environment

Security gate:

- `npm audit --audit-level=low`

## Repository Structure

```text
src/
	app/                 # Next.js App Router pages and layouts
	application/         # Use-cases, validators, DTOs, commands/queries
	components/          # App-level and reusable UI compositions
	constants/           # Shared constants and route contracts
	features/            # Feature slices (campaigns, integrations, etc.)
	hooks/               # Shared hooks
	infrastructure/      # Adapters, repositories, external integrations
	lib/                 # Utilities and cross-cutting helpers
	providers/           # React providers
	services/            # Service clients and orchestration helpers
	store/               # Client state stores
	types/               # Shared TypeScript types

terraform/
	modules/             # Reusable infrastructure modules
	environments/        # Root compositions per environment
	bootstrap/           # Backend/bootstrap setup definitions

.github/workflows/     # CI/CD workflows
docs/                  # Engineering and platform documentation
```

## Documentation Map

- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_GUIDE.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/ENVIRONMENT_GUIDE.md`
- `docs/CONTRIBUTING.md`
- `BACKEND_FOUNDATION.md`
- `REPOSITORY_BASELINE_AUDIT.md`
- `RELEASE_BASELINE.md`
- `docs/archive/sprint/` (historical sprint documents)

## Sprint 5.6 Baseline Status

- Backend foundation consolidation completed without adding new integration/OAuth feature behavior.
- Quality, architecture, OpenAPI, migration, and Docker health gates are green.
- Release baseline remains blocked by unresolved `npm audit` vulnerabilities pending controlled dependency remediation.

## Deployment Safety

- Do not run `terraform apply` without explicit change approval.
- Do not deploy ECS services manually outside CI/CD controls.
- Use immutable image tags for all releases.

## Notes

- Static export build is enabled (`next build` generates static routes).
- Some infrastructure workflows are manual (`workflow_dispatch`) by design.