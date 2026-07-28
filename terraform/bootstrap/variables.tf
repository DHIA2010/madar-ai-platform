variable "aws_region" {
  description = "AWS region for bootstrap resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project identifier used in naming and tags"
  type        = string
  default     = "madar"
}

variable "environment" {
  description = "Bootstrap environment label"
  type        = string
  default     = "bootstrap"
}

variable "state_bucket_name" {
  description = "Global S3 bucket name for Terraform remote state"
  type        = string
  default     = "madar-terraform-state-160450753643"
}

variable "state_key_prefix" {
  description = "Prefix path used by Terraform state objects in the bucket"
  type        = string
  default     = "madar"
}

variable "github_repository_override" {
  description = "Optional owner/repo override. Leave empty to auto-detect from git remote origin metadata"
  type        = string
  default     = ""
}

variable "github_allowed_branches" {
  description = "Branches allowed to assume role via GitHub Actions"
  type        = list(string)
  default     = ["main"]

  validation {
    condition     = length(var.github_allowed_branches) == 1 && var.github_allowed_branches[0] == "main"
    error_message = "Only the main branch is allowed for Terraform deployment role assumption."
  }
}

variable "github_allowed_environments" {
  description = "GitHub Actions environments allowed to assume role"
  type        = list(string)
  default     = ["stage", "production"]

  validation {
    condition     = length(setsubtract(toset(var.github_allowed_environments), toset(["stage", "production"]))) == 0 && length(var.github_allowed_environments) == 2
    error_message = "Only stage and production environments are allowed for Terraform deployment role assumption."
  }
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
