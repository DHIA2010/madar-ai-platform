# MADAR Architecture

## High-Level Architecture
MADAR is a frontend-first application built with Next.js App Router (React 19 + TypeScript) and organized as a modular UI platform for marketing operations workflows. The current repository is focused on the presentation layer, interaction layer, and reusable component system. Data is currently provided by local/static sources and component-level mocks, with backend integration planned.

Core stack:
- Next.js 16 App Router
- TypeScript (workspace-pinned)
- Tailwind CSS v4 + shadcn UI patterns
- Zustand (targeted local state)
- next-themes + custom UI theme layer
- Recharts and ApexCharts for visualization

## Folder Structure
Top-level structure:
- `src/app`: Routing, layouts, and route-level pages
- `src/components`: Reusable app and UI components
- `src/components/ui`: Design-system primitives (buttons, inputs, table, dialog, etc.)
- `src/providers`: Cross-cutting providers
- `src/store`: Zustand stores
- `src/lib`: Utility helpers
- `src/hooks`: Shared hooks
- `public`: Static assets (images, cards, illustrations)
- `docs`: Engineering and product documentation

## App Router Structure
Routing uses App Router route groups:
- `(layout-pages)`: Main product shell routes (dashboard, apps, forms, tables, charts, docs)
- `(no-layout-pages)`: Auth and error flows outside admin shell

Root behavior:
- `/` redirects to `/dashboard/analytics`
- Root metadata and viewport are defined in the root layout

## Layout Hierarchy
Layout flow:
1. `src/app/layout.tsx`
	- Loads global CSS
	- Sets SEO metadata/viewport
	- Mounts `ThemeProvider` and `UIThemeProvider`
2. `src/app/(layout-pages)/layout.tsx`
	- Wraps content in `TooltipProvider`
	- Mounts `AdminLayout`
	- Mounts `Toaster` and `ThemeCustomizer`
3. `src/components/layout/admin-layout.tsx`
	- Renders top bar, sidebar shell, page body, footer
4. `src/app/(no-layout-pages)/layout.tsx`
	- Lightweight wrapper for auth/error screens

## Providers
Current provider chain:
- `next-themes` `ThemeProvider` in root layout
- `UIThemeProvider` for custom theme class orchestration
- `TooltipProvider` in `(layout-pages)` layout
- `SidebarProvider` in admin layout

Provider responsibilities:
- Keep cross-cutting behavior centralized
- Avoid page-level re-registration of global providers
- Maintain SSR-safe patterns (DOM mutation in effects only)

## State Management
State is intentionally minimal and localized:
- `src/store/ui-theme.store.ts` uses Zustand for persisted theme selection
- Component-local state manages UI interactions (sidebar open/hover, table sort/filter, etc.)

Guidelines:
- Keep global store surface small
- Add stores only for shared cross-route state
- Prefer derived state inside components where possible

## Theme System
Theme architecture combines:
- `next-themes` for mode handling (`light`/`dark`/`system`)
- Custom HTML classes managed by `UIThemeProvider` for branded variants:
  - `dark-blue`
  - `gaussian-black`
  - `semi-dark`
- CSS tokens in `globals.css` using OKLCH variables and Tailwind v4 theme mapping

Theme principles:
- Token-first styling (`--background`, `--primary`, `--chart-*`, etc.)
- No hard-coded brand colors in feature pages when tokens exist
- Theme switching must remain hydration-safe

## Navigation Architecture
Navigation is shell-driven and config-backed in component code:
- `AppSidebar` owns the menu model and sections
- `NavMain` handles nested route matching and collapsible behavior
- `NavSecondary`, `NavUser`, and topbar dropdown components handle auxiliary actions

Current state:
- Navigation items are declared in TS objects and map to App Router paths
- A subset of routes are template/demo-oriented and can be pruned as product scope tightens

## Charts Architecture
Chart layer supports both libraries:
- `src/components/ui/chart.tsx`: shared Recharts wrapper, theming, tooltip/legend helpers
- ApexCharts routes/components for alternate visual styles

Strategy:
- Use shared wrapper components to enforce tokenized chart colors
- Keep feature metrics transformation logic outside visual components
- Standardize chart accessibility labels as a follow-up hardening step

## Data Layer
Current state:
- Predominantly static and local data sources in route/component files
- No production backend integration in this repository yet

Target direction:
- Introduce a typed service layer (`src/lib/services/*`)
- Keep API contracts and mapping logic out of presentational components
- Add caching/fetch policies per route boundary

## Reusable Component Strategy
Component layers:
- `src/components/ui/*`: low-level reusable primitives
- `src/components/*`: composed feature components and shell elements
- Route files: composition and wiring only

Rules:
- Add to `ui` when behavior is generic and product-agnostic
- Add to `components` when behavior is domain/composition-specific
- Keep route files thin and focused on orchestration

## Coding Conventions
Current enforced and expected conventions:
- TypeScript strict mode enabled
- Path alias: `@/*` -> `src/*`
- Functional React components
- Tailwind utility-first styling with token usage
- Prefer named exports for shared utilities; default exports acceptable for route/layout components

Team conventions to maintain:
- Keep component files single-responsibility
- Avoid cross-layer imports that bypass architecture boundaries
- Keep business semantics out of primitive UI components

## Project Boundaries
In scope (current repository):
- Web frontend shell, pages, and component system
- Theme and interaction layer
- Local/demo data rendering

Out of scope (for now):
- Production auth backend integration
- Production API gateway and persistence layer implementation
- ML model serving infrastructure

Boundary policy:
- Avoid embedding backend assumptions in UI primitives
- Keep template/demo routes clearly separable from core MADAR modules

## Tooling Note: TypeScript Version Pin
Workspace is pinned to local TypeScript (`node_modules/typescript/lib`) to align editor diagnostics with project compiler behavior.

Why:
- VS Code 4 bundles TypeScript 6.x and reports TS2882 for side-effect CSS imports
- Project compiler is TypeScript 5.9.x and passes cleanly
- Pinning local TS keeps diagnostics deterministic across contributors and CI until a planned TS 6 migration

