# MADAR Deployment Guide

## 10. Deployment Guide

This guide defines the controlled deployment process. It does not execute provisioning by itself.

### Workflow Chain

1. Developer merges validated changes.
2. Trigger infrastructure workflow with target environment.
3. GitHub Actions runs Terraform init/validate/plan.
4. Human reviews plan output.
5. Manual approval gate is completed.
6. Terraform apply runs only if approved.
7. Trigger container deployment workflow.
8. Docker images are built and pushed to ECR.
9. ECS task definitions are updated with immutable image tags.
10. ECS services roll out and wait until stable.

### Prerequisites

- GitHub Environments configured:
  - `local`
  - `stage`
  - `production`
  - `local-approval`
  - `stage-approval`
  - `production-approval`
- Required repository/environment variables:
  - `AWS_REGION`
  - `TERRAFORM_ROLE_ARN`
  - `DEPLOY_ROLE_ARN`
  - `ECR_FRONTEND_REPOSITORY`
  - `ECR_BACKEND_REPOSITORY`
  - `ECS_CLUSTER_NAME`
  - `ECS_FRONTEND_SERVICE_NAME`
  - `ECS_BACKEND_SERVICE_NAME`
- Terraform state S3 bucket and DynamoDB lock table exist per environment.

### Plan-Only Execution

1. Run workflow: Infrastructure Plan and Apply.
2. Choose environment.
3. Keep `execute_apply = false`.
4. Review artifact `tfplan-<environment>`.

### Approved Apply Execution

1. Re-run workflow with same environment.
2. Set `execute_apply = true`.
3. Approve the `*-approval` environment gate.
4. Confirm apply logs and outputs.

### Container Deploy Execution

1. Run workflow: Build Push and Deploy ECS.
2. Choose environment.
3. Set `image_tag` to immutable tag (recommended: git SHA).
4. Approve `*-approval` environment gate.
5. Verify ECS services stable and healthy.

### Post-Deployment Validation

- CloudFront URL health check.
- API `/api/health` returns 200.
- Database connectivity check from backend logs.
- Redis connectivity check from backend logs.
- OAuth callback smoke test.
- Webhook endpoint signature validation test.

### Change Control

- Production changes require approved RFC/change record.
- Infra and app changes should be deployed separately when possible.
- Emergency changes still require post-incident documentation.
