variable "name_prefix" {
  type = string
}

variable "github_oidc_provider_arn" {
  type = string
}

variable "github_repository" {
  description = "GitHub repository in owner/repo format"
  type        = string
}

variable "runtime_secret_arns" {
  type    = list(string)
  default = []
}

variable "terraform_state_resource_arns" {
  description = "Allowed S3 and DynamoDB ARNs for Terraform backend"
  type        = list(string)
  default     = []
}

variable "deployment_operator_principals" {
  description = "IAM principal ARNs allowed to assume deployment operator role"
  type        = list(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}
