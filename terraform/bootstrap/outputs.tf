output "account_id" {
  description = "AWS account ID where bootstrap resources are planned"
  value       = data.aws_caller_identity.current.account_id
}

output "terraform_state_bucket_name" {
  description = "Terraform remote state bucket name"
  value       = aws_s3_bucket.terraform_state.bucket
}

output "terraform_state_kms_key_arn" {
  description = "KMS key ARN used for Terraform state bucket encryption"
  value       = aws_kms_key.terraform_state.arn
}

output "github_oidc_provider_arn" {
  description = "GitHub Actions OIDC provider ARN"
  value       = aws_iam_openid_connect_provider.github.arn
}

output "terraform_deploy_role_arn" {
  description = "Terraform deployment role ARN for GitHub Actions"
  value       = aws_iam_role.terraform_deploy.arn
}

output "github_allowed_subjects" {
  description = "Allowed GitHub OIDC subject claims"
  value       = local.github_subjects
}

output "github_repository_resolved" {
  description = "GitHub owner/repository resolved from git metadata or override"
  value       = local.github_repository
}
