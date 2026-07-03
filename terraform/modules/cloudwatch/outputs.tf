output "frontend_log_group_name" {
  value = aws_cloudwatch_log_group.frontend.name
}

output "backend_log_group_name" {
  value = aws_cloudwatch_log_group.backend.name
}

output "workers_log_group_name" {
  value = aws_cloudwatch_log_group.workers.name
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}
