variable "name_prefix" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "alarm_email_endpoints" {
  type    = list(string)
  default = []
}

variable "alb_arn_suffix" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
