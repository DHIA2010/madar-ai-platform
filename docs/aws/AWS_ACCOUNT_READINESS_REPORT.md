# AWS Account Readiness Report (Read-Only)

Date: 2026-06-23
Audit mode: Read-only only. No resources created, modified, or deleted.

## 1. Authentication and Context

- STS identity check: PASS
- Account ID: `160450753643`
- IAM principal: `arn:aws:iam::160450753643:user/madar-admin`
- AWS CLI version: `aws-cli/2.35.11 Python/3.14.6 Darwin/23.5.0 source/arm64`
- Default region: `eu-central-1`

## 2. Inventory Results

### Regional inventory

#### eu-central-1
- VPCs: 1 (`172.31.0.0/16`)
- Subnets: 3
- Internet Gateways: 1
- NAT Gateways: 0
- Security Groups: 1
- ECS Clusters: 0
- ECR Repositories: 0
- RDS Instances: 0
- ElastiCache Clusters: 0
- ElastiCache Replication Groups: 0
- ACM Certificates: 0
- Secrets Manager Secrets: 0

#### us-east-1
- VPCs: 1 (`172.31.0.0/16`)
- Subnets: 6
- Internet Gateways: 1
- NAT Gateways: 0
- Security Groups: 1
- ECS Clusters: 0
- ECR Repositories: 0
- RDS Instances: 0
- ElastiCache Clusters: 0
- ElastiCache Replication Groups: 0
- ACM Certificates: 0
- Secrets Manager Secrets: 0

#### me-central-1
- Inventory calls failed with `AuthFailure` for all tested services.

### Global inventory

- S3 buckets: 0
- CloudFront distributions: 0
- Route53 hosted zones: 0
- IAM roles: 3 (`AWSServiceRoleForResourceExplorer`, `AWSServiceRoleForSupport`, `AWSServiceRoleForTrustedAdvisor`)
- IAM users: 1 (`madar-admin`)
- IAM OIDC providers: 0
- MFA list call for `madar-admin`: failed (`iam:ListMFADevices` was not allowed in this session)

## 3. Existing Infrastructure Reuse Potential

Reusable baseline assets (if intentionally retained):
- Default VPC and default networking in `eu-central-1` and `us-east-1`.

No reusable MADAR application platform assets found yet:
- ECS/ECR/RDS/ElastiCache: none discovered.
- Edge/DNS/TLS assets (CloudFront/Route53/ACM): none discovered.

## 4. Conflict Detection

### Naming conflicts
- No MADAR-named resources discovered in audited services.
- No deployment-related IAM role names discovered by pattern checks (`deploy`, `github`, `terraform`, `ecs`, `ecr`, `cicd`).

### CIDR conflicts
- Existing discovered VPC CIDRs: `172.31.0.0/16` (default VPCs).
- Planned MADAR CIDRs (`10.40.0.0/16`, `10.50.0.0/16`) do not overlap.

### Existing Terraform state buckets
Checked with read-only `s3api head-bucket`:
- `madar-terraform-state-local`: 404 Not Found
- `madar-terraform-state-stage`: 404 Not Found
- `madar-terraform-state-production`: 404 Not Found

Interpretation:
- Planned backend buckets do not currently exist in reachable scope.

### Existing GitHub deployment integrations
- IAM OIDC providers: none found.
- No deployment-focused IAM roles found.

## 5. IAM Sufficiency for Terraform Provisioning

Assessment: SUFFICIENT (technically)

Evidence:
- User has attached `AdministratorAccess` policy.
- Principal policy simulation returned `allowed` for representative provisioning actions across EC2, ECS, ECR, RDS, ElastiCache, S3, Route53, ACM, IAM, Secrets Manager, and CloudFront.

Risk note:
- Permissions are broad and exceed least-privilege best practice. Recommended to move automation to scoped roles before production use.

## 6. Region Recommendation for MADAR

Recommended primary region: `eu-central-1` (Frankfurt)

Reasoning:
- Full-service maturity for MADAR stack components.
- Strong latency profile for Saudi/GCC users when fronted by CloudFront.
- Better operational and ecosystem maturity for first production rollout.

Secondary option: `me-central-1` (UAE)
- Evaluate for strict regional affinity/data residency priorities.
- Current `AuthFailure` indicates this region is not ready for this principal yet.

## 7. Readiness Verdict

Current status: PARTIALLY READY

What is ready:
1. Authentication and principal identity.
2. Provisioning permissions (from IAM perspective).
3. No discovered CIDR conflicts with planned ranges.

What is not ready yet:
1. Terraform backend buckets are not present.
2. GitHub deployment integration (OIDC + roles) is not configured.
3. me-central-1 access is not usable for this principal.

## 8. Next Steps (still non-provisioning)

1. Decide target rollout region (`eu-central-1` recommended).
2. Approve backend naming and create backend bucket strategy.
3. Design and approve least-privilege CI/CD and Terraform roles with OIDC trust.
4. Keep this audit output as the zero-state baseline before first provisioning.
