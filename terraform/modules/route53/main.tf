resource "aws_route53_record" "app" {
  zone_id = var.hosted_zone_id
  name    = var.app_domain_name
  type    = "A"

  alias {
    name                   = var.app_alias_dns_name
    zone_id                = var.app_alias_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  zone_id = var.hosted_zone_id
  name    = var.api_domain_name
  type    = "A"

  alias {
    name                   = var.api_alias_dns_name
    zone_id                = var.api_alias_zone_id
    evaluate_target_health = true
  }
}
