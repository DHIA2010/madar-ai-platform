variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "frontend_target_group_arn" {
  type = string
}

variable "backend_target_group_arn" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "runtime_role_arn" {
  type = string
}

variable "frontend_image" {
  type = string
}

variable "backend_image" {
  type = string
}

variable "frontend_container_port" {
  type    = number
  default = 3000
}

variable "backend_container_port" {
  type    = number
  default = 4000
}

variable "frontend_cpu" {
  type    = number
  default = 512
}

variable "frontend_memory" {
  type    = number
  default = 1024
}

variable "backend_cpu" {
  type    = number
  default = 512
}

variable "backend_memory" {
  type    = number
  default = 1024
}

variable "operating_system_family" {
  type    = string
  default = "LINUX"
}

variable "cpu_architecture" {
  type    = string
  default = "X86_64"
}

variable "frontend_desired_count" {
  type    = number
  default = 2
}

variable "backend_desired_count" {
  type    = number
  default = 2
}

variable "frontend_min_count" {
  type    = number
  default = 2
}

variable "frontend_max_count" {
  type    = number
  default = 6
}

variable "backend_min_count" {
  type    = number
  default = 2
}

variable "backend_max_count" {
  type    = number
  default = 6
}

variable "frontend_environment" {
  type    = map(string)
  default = {}
}

variable "backend_environment" {
  type    = map(string)
  default = {}
}

variable "frontend_secrets" {
  type = list(object({
    name       = string
    value_from = string
  }))
  default = []
}

variable "backend_secrets" {
  type = list(object({
    name       = string
    value_from = string
  }))
  default = []
}

variable "frontend_log_group_name" {
  type = string
}

variable "backend_log_group_name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
