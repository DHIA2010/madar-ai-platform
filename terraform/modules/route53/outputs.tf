output "app_record_fqdn" {
  value = aws_route53_record.app.fqdn
}

output "api_record_fqdn" {
  value = aws_route53_record.api.fqdn
}
