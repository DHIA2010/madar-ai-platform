variable "name_prefix" {
  type = string
}

variable "secrets" {
  description = "Map of secret keys to optional initial values"
  type = map(object({
    value = optional(string)
  }))
}

variable "recovery_window_days" {
  type    = number
  default = 30
}

variable "tags" {
  type    = map(string)
  default = {}
}
