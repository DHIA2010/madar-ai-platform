# Stage Deployment Guide

## 16. Stage Deployment Guide

Purpose:
- Validate integration against realistic cloud infrastructure.
- Verify Terraform changes and deployment automation before production.

Stage controls:
- Isolated VPC and state backend.
- Lower-cost compute and data tiers.
- Manual approval before Terraform apply and ECS deployment.

Procedure:
1. Update Terraform/module changes in a feature branch.
2. Run Infrastructure Plan workflow for `stage` with apply disabled.
3. Review plan with platform reviewer.
4. Run Infrastructure workflow with `execute_apply=true`.
5. Approve `stage-approval` gate.
6. Run container deploy workflow with immutable `image_tag`.
7. Approve `stage-approval` gate for deployment.
8. Execute stage smoke tests.

Stage smoke tests:
- Frontend login route load.
- API health endpoint.
- DB migration status.
- Redis read/write check.
- OAuth callback end-to-end test.
- Webhook signature verification.

Exit criteria for production promotion:
- No critical errors for 24 hours.
- Alarm baseline stable.
- Performance within SLO envelope.
- Security checks pass.
