# Organization Guide

## Overview
Sprint 4 delivers a production-ready Organization Platform on top of the existing Identity Platform architecture.

## Capabilities
- Organization aggregate lifecycle: create, rename, update, archive, restore, soft delete.
- Organization profile model: metadata, branding, logo URL, timezone, locale, currency, subscription reference, settings.
- Ownership governance: owner tracking and ownership transfer with invariant checks.
- Organization-scoped listing with pagination, filtering, and sorting.

## Domain Invariants
- Organization name length is validated in domain logic.
- Deleted organizations are immutable.
- Restore is allowed only from archived state.
- Every organization must retain at least one active owner.

## Integration
- RBAC checks enforce organization write operations.
- Domain events are emitted for create/update/archive/delete/ownership transfer.
- Audit logs are persisted for all organization mutations.
- Metrics emitted: `organization_create_duration`, `organization_api_latency`.
