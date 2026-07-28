# Disaster Recovery and Continuity

## 11. Disaster Recovery Plan

Recovery targets:
- Production RTO: 2 hours.
- Production RPO: 15 minutes for transactional data.
- Stage RTO: 8 hours.
- Stage RPO: 24 hours.

Disaster classes:
- Application outage (ECS service unstable).
- Data tier outage (RDS/Redis unavailability).
- Regional degradation.
- CI/CD credential or supply-chain compromise.

Response phases:
1. Detect: alarm triggers and incident declared.
2. Contain: freeze deployments, isolate affected components.
3. Recover: execute service/data recovery runbooks.
4. Validate: synthetic checks and business KPIs.
5. Review: incident postmortem within 48 hours.

Regional recovery strategy:
- Keep Terraform environment templates region-portable.
- Maintain warm standby plan for secondary region.
- Use Route53 failover policy when secondary region is activated.

## 12. Backup Strategy

RDS:
- Automated backups enabled.
- Production retention: 30 days.
- Stage retention: 7 days.
- Daily snapshot copy to separate backup account recommended.

Redis:
- Snapshot retention enabled.
- Daily snapshots with 7-day retention in stage, 14-day in production.

S3:
- Bucket versioning enabled.
- Lifecycle retention policy by object prefix.
- Optional CRR for production assets.

Configuration and IaC:
- Terraform state bucket versioning enabled.
- Git repository is source of truth for infra definitions.
- Artifact retention for deployment records and plans.

Backup verification:
- Quarterly restore drill for RDS.
- Monthly random object restore test for S3.
- Quarterly Redis snapshot restore simulation.

## 13. Rollback Strategy

Infrastructure rollback:
- Prefer forward-fix for stateful resources.
- For stateless regressions, revert Terraform commit and apply reviewed plan.
- Never destroy production databases for rollback.

Application rollback:
- ECS rollback by re-registering previous task definition revision.
- Keep last 30 ECR images via lifecycle policy.
- Deployment circuit breaker enabled in ECS services.

Database rollback:
- Point-in-time restore to new instance.
- Redirect backend to restored instance only after integrity checks.
- Execute compensating migrations where possible.

Operational rollback checklist:
1. Identify bad release SHA and task definition revision.
2. Repoint ECS services to known-good revision.
3. Validate ALB health and business workflows.
4. Keep incident timeline and decision log.
