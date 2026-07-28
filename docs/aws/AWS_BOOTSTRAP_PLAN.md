# AWS Bootstrap Plan (No Provisioning Yet)

This plan defines the minimum preparation work before first Terraform provisioning.

Current baseline from audit:
- Account is reachable and authenticated as `madar-admin`.
- Default resources exist only (default VPC footprint in `eu-central-1` and `us-east-1`).
- No application platform resources found yet (ECS/ECR/RDS/ElastiCache/CloudFront/Route53/ACM/Secrets).
- No GitHub OIDC provider and no deployment-focused IAM roles found.
- Terraform backend buckets planned for MADAR are not present.

## Phase 0: Access and Governance

1. Keep `madar-admin` only for bootstrap and break-glass paths.
2. Enable/verify MFA for privileged access and enforce MFA condition where possible.
3. Define break-glass workflow and approval process.
4. Confirm account alias, security contacts, and billing alerts.

## Phase 1: Landing Zone Guardrails

1. Confirm CloudTrail coverage and central log retention policy.
2. Define Config/Security Hub baseline and target controls.
3. Define KMS key strategy for state, secrets, and data stores.
4. Finalize tagging schema and mandatory tag enforcement.

## Phase 2: Identity and Automation Roles

1. Create least-privilege Terraform execution role(s) for local/stage/production.
2. Create least-privilege deploy role(s) for ECR push and ECS service updates.
3. Restrict `iam:PassRole` to approved role ARNs only.
4. Keep human users out of routine provisioning paths.

## Phase 3: CI/CD Trust Setup

1. Create GitHub OIDC provider for the account.
2. Create least-privilege role(s) for:
   - Terraform plan/apply
   - ECR push and ECS deploy
3. Configure GitHub environment approvals (`stage`, `production`).
4. Add branch/repo/environment conditions to role trust policies.

## Phase 4: Pre-Provision Signoff

1. Approve region decision (primary + fallback).
2. Approve naming standards and CIDR allocations.
3. Approve backend and lock strategy.
4. Approve final Terraform plan execution readiness checklist.

## Exit Criteria

Bootstrap is complete when:
- Read-only inventory is complete and signed off as baseline.
- IAM roles and trust boundaries are approved.
- Backend strategy is approved.
- Change-management approval to run first `terraform init/plan` is granted.
