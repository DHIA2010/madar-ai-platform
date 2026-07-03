variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "name_prefix" {
  type    = string
  default = "madar-prod"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "domain_name" {
  type = string
}

variable "app_subdomain" {
  type    = string
  default = "app"
}

variable "api_subdomain" {
  type    = string
  default = "api"
}

variable "hosted_zone_id" {
  type = string
}

variable "github_repository" {
  type = string
}

variable "github_oidc_provider_arn" {
  type = string
}

variable "deployment_operator_principals" {
  type = list(string)
}

variable "alarm_email_endpoints" {
  type    = list(string)
  default = []
}

variable "db_master_password" {
  type      = string
  sensitive = true
}

variable "frontend_image" {
  type = string
}

variable "backend_image" {
  type = string
}

variable "terraform_state_bucket_name" {
  type    = string
  default = "madar-terraform-state-production"
}
