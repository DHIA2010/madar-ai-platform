# Production Deployment Guide

## 17. Production Deployment Guide

Purpose:
- Controlled, auditable production rollout with explicit approval checkpoints.

Mandatory gates:
- Approved Terraform plan.
- Change ticket approved.
- Production deployment window confirmed.
- Rollback owner assigned.

Procedure:
1. Freeze non-critical changes.
2. Run Infrastructure Plan workflow for `production` with apply disabled.
3. Conduct architecture and security review of plan.
4. Re-run with `execute_apply=true`.
5. Approve `production-approval` gate.
6. Verify infrastructure readiness outputs.
7. Run container deploy workflow for `production` with immutable image tag.
8. Approve `production-approval` gate for deployment.
9. Monitor service stabilization and alarms for at least 30 minutes.

Production verification checklist:
- CloudFront and Route53 resolution healthy.
- ALB target groups healthy.
- Frontend critical flows pass.
- API authentication and authorization pass.
- DB and Redis connection pools stable.
- No elevated 5xx or latency spikes.

Rollback decision policy:
- If p95 latency or 5xx breaches SLO for 10 consecutive minutes, rollback.
- If auth failures exceed threshold, rollback.
- If data corruption risk observed, freeze traffic and execute incident plan.

Post-deployment:
- Record release metadata (image tags, task definition revisions, terraform commit).
- Document findings and action items.
