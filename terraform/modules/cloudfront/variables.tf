variable "name_prefix" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

variable "acm_certificate_arn" {
  type = string
}

variable "aliases" {
  type    = list(string)
  default = []
}

variable "enable_assets_bucket_origin" {
  type    = bool
  default = false
}

variable "assets_bucket_regional_domain_name" {
  type    = string
  default = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
