# Terraform Backend Plan (Pre-Provision Design)

No resources are provisioned by this plan; this is a design and execution sequence.

## 1. Backend Strategy

Use isolated S3 backend per environment with S3 lockfile.

Planned backend buckets:
- `madar-terraform-state-local`
- `madar-terraform-state-stage`
- `madar-terraform-state-production`

State paths:
- `madar/local/terraform.tfstate`
- `madar/stage/terraform.tfstate`
- `madar/production/terraform.tfstate`

Lock strategy:
- `use_lockfile = true` (already aligned in Terraform code)

## 2. Required Backend Controls

1. Bucket versioning: enabled.
2. Encryption at rest: SSE-S3 or SSE-KMS.
3. Public access block: fully enabled.
4. Least-privilege bucket policy for Terraform roles only.
5. Lifecycle policy for old state versions.
6. Optional cross-account backup copy for production state.

## 3. Access Model

Roles that need backend access:
- Terraform execution role (plan/apply).
- CI/CD role (if CI runs Terraform).

Current IAM observation:
- The current user has broad administrative permissions.
- For production safety, backend access should be moved to dedicated least-privilege automation roles.

Minimum S3 permissions on backend bucket/object paths:
- `s3:ListBucket`
- `s3:GetObject`
- `s3:PutObject`
- `s3:DeleteObject` (for lockfile operations)

## 4. Migration/Initialization Sequence

1. Provision backend buckets with a one-time bootstrap method.
2. Apply strict bucket policies and public access block.
3. Update/confirm environment backend blocks in Terraform (already present).
4. Run `terraform init -reconfigure` per environment.
5. Validate state write/read and lock behavior with `terraform plan`.

## 5. Validation Checklist

- Backend bucket exists in target account.
- Bucket policy denies non-approved principals.
- Versioning and encryption enabled.
- `terraform init` succeeds for local/stage/production.
- `terraform plan` writes lockfile and releases lock cleanly.

## 6. Current Audit Status

- Head-bucket checks for planned names returned 404 Not Found.
- Backend resources are not yet available for Terraform usage.
- IAM permissions are sufficient to manage backend resources, but backend buckets still do not exist.

Result: backend not ready until bootstrap backend creation is completed.
