# MADAR Design System

This document defines the current UI foundations and the standards to follow when extending the MADAR interface.

## Typography
Current baseline:
- Primary font: Inter (configured in root layout)
- Use semantic text hierarchy via Tailwind utility classes

Guidelines:
- Use consistent scale (`text-xs` through `text-2xl+`) based on information hierarchy
- Reserve heavy weights for emphasis and section headers
- Keep long-form readability with adequate line height

## Spacing
Current baseline:
- Tailwind spacing scale is the source of truth
- Common layout paddings are implemented with utility classes in page shells (for example, dashboard content areas)

Guidelines:
- Use spacing tokens/scale, avoid arbitrary values unless justified
- Keep component internal spacing predictable
- Use consistent section spacing across feature pages

## Border Radius
Tokenized radius scale in global theme mapping:
- `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-2xl`, `--radius-3xl`, `--radius-4xl`

Guidelines:
- Use radius tokens through component classes
- Preserve consistent corner language between cards, dialogs, inputs, and menus

## Elevation
Current patterns:
- Subtle elevation with shadows on interactive containers and cards
- Glass/translucent effects in themed variants

Guidelines:
- Use elevation to indicate hierarchy, not decoration
- Keep shadow intensity restrained in dense data screens

## Colors
Current system:
- OKLCH-based semantic tokens in global CSS
- Semantic variables include `--background`, `--foreground`, `--primary`, `--muted`, `--destructive`, `--chart-*`, and sidebar tokens
- Theme variants: `dark-blue`, `gaussian-black`, `semi-dark`

Guidelines:
- Prefer semantic tokens over hard-coded colors
- Keep contrast compliant for text and controls
- Add new colors as semantic tokens before usage

## Buttons
Source:
- Reusable button primitive in `src/components/ui/button.tsx`

Guidelines:
- Use standardized variants and sizes
- Keep primary actions visually dominant
- Avoid introducing one-off button styles in route files

## Cards
Current patterns:
- Card surfaces map to theme tokens (`--card`, `--card-foreground`)
- Some themes include specialized card backgrounds and borders

Guidelines:
- Use card primitives for data grouping
- Keep spacing and title/body hierarchy consistent

## Inputs
Source:
- `input`, `textarea`, `select`, `field`, and `input-group` primitives

Guidelines:
- Keep labels explicit and error messages clear
- Ensure focus rings remain visible in all themes
- Use consistent vertical rhythm across form sections

## Tables
Source:
- Base table primitives + TanStack React Table integration in composed components

Guidelines:
- Keep sorting/filtering affordances explicit
- Preserve readability for dense datasets
- Ensure export/print actions are secondary to core table interactions

## Dialogs
Source:
- Dialog/sheet/popover primitives under `src/components/ui`

Guidelines:
- Use dialogs for short, focused tasks
- Keep destructive actions explicit and reversible where possible
- Maintain keyboard accessibility and focus trap behavior

## Charts
Current implementation:
- Recharts wrapper with configurable theme-aware colors
- ApexCharts used in dedicated chart pages

Guidelines:
- Use chart tokens (`--chart-1` to `--chart-5`) for palette consistency
- Add labels, legends, and tooltips that explain meaning, not only values
- Preserve accessibility by pairing visuals with textual context

## Icons
Current icon sets:
- Lucide React (primary)
- Bootstrap Icons and Boxicons in dedicated routes

Guidelines:
- Prefer one primary icon language per production module
- Use icons to support scanning, not replace text labels

## Responsive Rules
Current behavior:
- Sidebar and shell adapt based on viewport width
- Mobile-specific overrides exist for themed layouts

Standards:
- Mobile-first component behavior
- Avoid horizontal scrolling for core workflows
- Validate key screens across mobile, tablet, desktop breakpoints

## RTL Rules
Current state:
- No dedicated RTL implementation in codebase yet

Standards for future support:
- Use logical spacing/alignment utilities where possible
- Avoid hard-coded left/right assumptions in layout code
- Validate navigation, tables, and forms under RTL before release

## Animation Rules
Current behavior:
- Utility-driven transitions and selective motion usage

Standards:
- Keep animation purposeful and short
- Avoid animation that delays task completion
- Respect reduced motion preferences for non-essential transitions

## Accessibility Standards
Baseline standards:
- Keyboard navigability for all interactive controls
- Visible focus states in all themes
- Semantic HTML and ARIA where required by custom composites
- Sufficient color contrast for text and critical UI states

Quality gate:
- Any new reusable component should be reviewed for keyboard behavior, focus management, and screen-reader clarity before merge.
