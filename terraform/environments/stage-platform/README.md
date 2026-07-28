# MADAR Stage Platform - Minimal MVP Stack

**Minimum viable platform for first Stage deployment.**

This stack provisions only the essential infrastructure required to deploy and run the MADAR frontend application on AWS Stage.

## Scope

- ECR repository for MADAR application image (frontend only)
- ECS Fargate cluster (managed container orchestration)
- 1 ECS task definition (single application)
- 1 ECS service with 1 desired task (minimal cost)
- Application Load Balancer with HTTP listener
- Target group with health checks
- CloudWatch logging (7-day retention)
- Secrets Manager (1 minimum secret)
- IAM roles (execution and runtime)
- Security groups (ALB and app tasks)

## Not in Scope (Phase 2+)

- Backend infrastructure (NestJS server)
- PostgreSQL database
- Redis cache
- Certificate Manager (HTTPS)
- Route53 DNS
- Auto Scaling policies
- CloudFront distribution
- WAF
- Monitoring dashboards
- EventBridge, SQS, SNS

## Dependencies

**REQUIRES:** `terraform/environments/stage-networking` must be applied first

This stack reads the networking remote state to obtain:
- VPC ID and subnets
- Security group IDs
- NAT gateway configuration

## Quick Start

```bash
cd terraform/environments/stage-platform

# Initialize
terraform init

# Verify
terraform fmt -recursive
terraform validate

# Plan
terraform plan -var-file=terraform.tfvars

# Apply
terraform apply -var-file=terraform.tfvars
```

## Resource Count

- Total: **9 resources**
- **Cost:** ~$65/month (minimal, Stage only)

## Deployment

1. Build: `docker build -t madar-stage/app:latest -f Dockerfile.frontend .`
2. Push: `aws ecr get-login-password | docker login ... && docker push <ECR_URL>:latest`
3. Monitor: `aws logs tail /aws/ecs/madar-stage-app --follow`
4. Test: Open ALB DNS in browser

## Success Criteria

- ALB DNS resolves
- MADAR login page loads
- Application is responsive
- Logs appear in CloudWatch
