# MADAR Terraform Infrastructure

This folder contains production-grade Terraform Infrastructure as Code for MADAR on AWS.

## Structure

- `modules/`: reusable infrastructure modules
- `environments/stage-networking`: dedicated stage networking foundation (VPC, subnets, routing)
- `environments/stage-platform`: dedicated stage application platform (ECS, ALB, ECR, CloudWatch)
- `environments/stage`: stage stack composition
- `environments/production`: production stack composition
- `environments/local`: optional isolated local cloud environment in AWS (cost-controlled)

## Safety

- Plan and apply are split workflows.
- Production apply is manual-approval gated.
- No resource is provisioned by this repository unless `terraform apply` is explicitly run.

## Bootstrap Requirements

Before first plan/apply:

1. Create remote state buckets and lock tables per environment.
2. Configure GitHub OIDC provider in AWS account.
3. Set GitHub environment approvals for `stage` and `production`.
4. Provide required secrets/variables in repository and environment settings.

Stage deployment order:

1. Apply `environments/stage-networking` first (VPC, subnets, routing, security groups).
2. Apply `environments/stage-platform` (ECS Fargate, ALB, ECR, CloudWatch, Secrets Manager).
3. Build and push Docker images to ECR repositories.
4. Monitor ECS service deployment via CloudWatch.
5. Test application via ALB DNS endpoint.
6. Expand to production after stage platform is fully operational.

## Commands

```bash
cd terraform/environments/stage
terraform init
terraform validate
terraform plan -var-file=terraform.tfvars
```

```bash
cd terraform/environments/production
terraform init
terraform validate
terraform plan -var-file=terraform.tfvars
```
