# Deployment Guide

## Scope

This guide covers repository and CI/CD deployment flow. It does not grant permission to provision or apply infrastructure automatically.

## Prerequisites

- GitHub environments configured with approval gates
- AWS OIDC roles configured for deploy and terraform workflows
- Environment variables configured in GitHub environment settings

## Application Deployment Flow

1. Run quality pipeline (`quality.yml`) and ensure all checks pass.
2. Trigger `deploy-containers.yml` with target environment and immutable image tag.
3. Build and push frontend/backend images to ECR.
4. Update ECS services with new task definition revisions.
5. Wait for services to stabilize.
6. If stabilization fails, workflow performs automatic rollback to previous task definitions.

## Infrastructure Deployment Flow

1. Trigger `infrastructure.yml` with target environment.
2. Run terraform init/validate/plan.
3. Review generated plan artifact.
4. If approved, execute apply through environment approval gate.

## Rollback

- Container deployment rollback is automatic when ECS stability wait fails.
- For infrastructure rollback, use reviewed Terraform change control and targeted plan/apply operations.

## Safety Controls

- Concurrency groups prevent overlapping deployments per environment.
- Manual dispatch and approvals enforce controlled changes.
- Immutable image tags are required.
