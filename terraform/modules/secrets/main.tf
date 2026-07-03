resource "aws_secretsmanager_secret" "this" {
  for_each = var.secrets

  name                    = "${var.name_prefix}/${each.key}"
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-${each.key}-secret"
  })
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = {
    for k, v in var.secrets : k => v
    if v.value != null
  }

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = each.value.value
}
