# MADAR Terraform Bootstrap

This project provisions only the Terraform bootstrap foundation for MADAR.

## Scope

- Terraform state S3 bucket
- KMS key for state encryption
- State bucket versioning
- State bucket public access block
- State bucket ownership controls (BucketOwnerEnforced)
- GitHub Actions OIDC provider
- Terraform deployment IAM role with least-privilege OIDC trust

Stable KMS alias used for state encryption key:

- alias/madar/terraform-state

GitHub OIDC subject construction reads repository owner/name from git remote origin metadata by default.

## Out of Scope

This project does not provision application infrastructure such as VPC, ECS, RDS, Redis, ALB, CloudFront, or other runtime resources.

## Usage

```bash
cd terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform validate
terraform plan -var-file=terraform.tfvars
```

Apply is intentionally manual and must only run after explicit approval.

## Backend Architecture Recommendation

Use a single backend bucket for the account:

- madar-terraform-state-160450753643

Separate states by keys:

- bootstrap/terraform.tfstate
- stage/network.tfstate
- stage/platform.tfstate
- stage/data.tfstate
- production/network.tfstate
- production/platform.tfstate

Bootstrap uses local state for the first run because the remote bucket does not exist yet.
After bootstrap apply creates the bucket, migrate bootstrap state to bootstrap/terraform.tfstate in that bucket.
