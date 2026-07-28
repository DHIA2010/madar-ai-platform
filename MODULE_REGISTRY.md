# Module Registry

## Objective
Avoid hardcoded backend wiring by making modules discoverable and registrable through a shared contract.

## Core Files

- `src/backend-foundation/types.ts`
- `src/backend-foundation/module-registry.ts`
- `src/backend-foundation/module-catalog.ts`
- `src/backend-foundation/bootstrap/create-backend-foundation.ts`
- `src/identity-platform/module.ts`
- `src/project-platform/module.ts`

## Module Contract

Each module definition provides:

- `id`
- `name`
- `version`
- `basePath`
- `capabilities`
- optional `healthCheck`
- optional `registerRoutes`
- optional `openApiPath`

## Current Registered Modules

1. `identity`
2. `project`

## Discovery Model

`discoverBackendModules` resolves module definitions from a catalog of dynamic import loaders.

This avoids hardcoded bootstrap internals and allows future expansion with catalog entries rather than server rewrites.

## Extension Procedure

1. Add module definition file in module package (`module.ts`).
2. Add discovery loader in `module-catalog.ts`.
3. Include module id in bootstrap discovery input.
4. Validate with module registry test and health snapshot.

## Notes on Organization Module

Current codebase models organization behavior under identity boundaries. If a standalone `organization-platform` package is introduced later, it can adopt the same module contract without changing existing registry consumers.
