# IDENTITY_MODEL

## Identity Entities
- User
- Session
- RefreshToken
- EmailVerification
- PasswordResetToken
- Membership
- OrganizationInvitation

## User Profile Fields
- fullName
- avatarUrl
- timezone
- language
- preferences
- accountStatus

## Identity Features
- Email change with password confirmation + re-verification.
- Password change with credential validation.
- Multi-device sessions.
- Session revoke by session id.

## Soft Delete Strategy
All mutable identity entities include `deleted_at` for soft deletion and retention compliance.
# IDENTITY MODEL

## Core entities
- User
- Organization
- Workspace
- Membership
- Session
- EmailVerificationToken
- PasswordResetToken
- AuditLog

## Relationships
- One user can belong to many organizations/workspaces through memberships.
- One organization can contain many workspaces.
- Membership binds user + organization (+ optional workspace) + role.
- Session belongs to user and is scoped to org/workspace context.

## Status models
- User status: `active`, `locked`, `pending_verification`, `disabled`
- Organization status: `active`, `suspended`, `archived`
- Workspace status: `active`, `archived`

## Soft deletion
Long-lived entities (`users`, `organizations`, `workspaces`, `memberships`, `sessions`) include `deleted_at`.
