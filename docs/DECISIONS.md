# Architectural Decisions Log

Use this file to record engineering decisions that affect architecture, standards, or long-term maintainability.

## Decision Template
- Date:
- Decision:
- Reason:
- Alternatives Considered:
- Status:

## Decision 001
- Date: 2026-06-18
- Decision: Use Next.js App Router with route groups for shell and non-shell experiences.
- Reason: The project requires clear separation between authenticated app surfaces and standalone auth/error screens while preserving shared root metadata and providers.
- Alternatives Considered:
  - Pages Router with custom shell switching
  - Single layout with conditional runtime branching
- Status: Accepted

## Decision 002
- Date: 2026-06-18
- Decision: Build UI foundations on Tailwind CSS v4 with reusable primitives under `src/components/ui`.
- Reason: Enables rapid iteration with consistent tokens and composable components across many product modules.
- Alternatives Considered:
  - CSS Modules per feature without shared primitives
  - Full CSS-in-JS stack
- Status: Accepted

## Decision 003
- Date: 2026-06-18
- Decision: Use targeted Zustand stores for cross-route UI state, starting with theme persistence.
- Reason: Keeps global state surface small while supporting persistent UX preferences.
- Alternatives Considered:
  - Context-only global state
  - Larger centralized state frameworks for all app data
- Status: Accepted

## Decision 004
- Date: 2026-06-18
- Decision: Pin VS Code workspace to local TypeScript SDK (`node_modules/typescript/lib`).
- Reason: VS Code bundled TypeScript 6.x introduced TS2882 diagnostics that diverged from project compiler behavior (TypeScript 5.9.x), creating false-positive editor noise.
- Alternatives Considered:
  - Upgrade project TypeScript immediately to 6.x
  - Suppress diagnostics
- Status: Accepted

## Decision 005
- Date: 2026-06-18
- Decision: Support both Recharts and ApexCharts in current architecture while standardizing token-driven styling.
- Reason: Existing template surfaces use both libraries; a shared styling contract allows consistency while migration decisions remain open.
- Alternatives Considered:
  - Enforce immediate single-library migration
  - Keep chart implementations fully ad hoc per page
- Status: Accepted
