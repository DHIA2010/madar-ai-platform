# MADAR Stage Networking Stack

This stack provisions the networking foundation for MADAR stage workloads only.

## Scope

- VPC
- Two public subnets across two Availability Zones
- Two application subnets across two Availability Zones
- Two data subnets across two Availability Zones
- Internet gateway
- One NAT gateway and one EIP for Stage cost optimization
- Public, application, and data route tables
- Route table associations
- Reusable security groups for future ECS, RDS, and Redis workloads

## Not in Scope

- ECS
- ECR
- RDS
- Redis
- ALB
- CloudFront
- Route53
- Secrets Manager
- VPC endpoints
- Custom network ACLs

## Usage

```bash
cd terraform/environments/stage-networking
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform fmt -recursive
terraform validate
terraform plan -var-file=terraform.tfvars
```

The stack is intentionally isolated from compute and data layers.

Note:
- Stage egress is intentionally cost-optimized to a single NAT gateway.
- The production networking stack must continue to use dual NAT gateways.
