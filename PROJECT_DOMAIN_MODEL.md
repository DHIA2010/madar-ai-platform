# Project Domain Model

## Project
- Owns identity, lifecycle, branding, metadata, settings, and execution context.
- Belongs to exactly one Organization.
- May reference one Workspace.
- Supports `active`, `archived`, and `deleted` states.

## Data Source
- Belongs to exactly one Project.
- Stores source metadata only.
- Supports metadata-only source types and future OAuth readiness flags.
- Supports `draft`, `enabled`, `disabled`, `archived`, and `deleted` states.

## Membership
- Project membership is modeled separately from organization membership.
- Organization roles are inherited; project roles can be applied explicitly.
