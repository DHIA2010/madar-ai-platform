variable "name_prefix" {
  description = "Resource naming prefix"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "public_subnets" {
  description = "Public subnet definitions"
  type = list(object({
    cidr = string
    az   = string
  }))
}

variable "private_subnets" {
  description = "Private subnet definitions"
  type = list(object({
    cidr = string
    az   = string
  }))
}

variable "application_subnets" {
  description = "Application private subnet definitions"
  type = list(object({
    cidr = string
    az   = string
  }))
  default = []
}

variable "data_subnets" {
  description = "Data private subnet definitions"
  type = list(object({
    cidr = string
    az   = string
  }))
  default = []
}

variable "nat_gateway_count" {
  description = "Number of NAT gateways to create, aligned to the first N public subnets"
  type        = number
  default     = 1

  validation {
    condition     = var.nat_gateway_count >= 1 && var.nat_gateway_count <= length(var.public_subnets)
    error_message = "nat_gateway_count must be at least 1 and no more than the number of public subnets."
  }
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
