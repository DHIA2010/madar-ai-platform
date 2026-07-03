variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment label"
  type        = string
  default     = "stage"
}

variable "name_prefix" {
  description = "Resource naming prefix"
  type        = string
  default     = "madar-stage"
}

variable "app_port" {
  description = "Port the application listens on"
  type        = number
  default     = 3000
}

variable "app_image_tag" {
  description = "Docker image tag for the application"
  type        = string
  default     = "latest"
}

variable "app_desired_count" {
  description = "Desired number of application tasks"
  type        = number
  default     = 1
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
