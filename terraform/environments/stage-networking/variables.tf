variable "aws_region" {
  description = "AWS region for the networking stack"
  type        = string
  default     = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "us-east-2", "us-west-2"], var.aws_region)
    error_message = "The stage networking stack must be deployed in an approved region (us-east-1, us-east-2, or us-west-2)."
  }
}

variable "environment" {
  description = "Environment label used in resource tags"
  type        = string
  default     = "Stage"
}

variable "name_prefix" {
  description = "Resource naming prefix"
  type        = string
  default     = "madar-stage-network"
}

variable "vpc_cidr" {
  description = "CIDR block for the stage VPC"
  type        = string
  default     = "10.40.0.0/16"
}

variable "azs" {
  description = "Availability zones used by the networking stack"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.azs) == 2
    error_message = "Exactly two Availability Zones are required for the stage networking stack."
  }
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
