output "secret_arns" {
  value = {
    for key, secret in aws_secretsmanager_secret.this : key => secret.arn
  }
}

output "secret_names" {
  value = {
    for key, secret in aws_secretsmanager_secret.this : key => secret.name
  }
}
