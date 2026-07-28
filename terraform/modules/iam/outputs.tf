output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_runtime_role_arn" {
  value = aws_iam_role.ecs_task_runtime.arn
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}

output "deployment_operator_role_arn" {
  value = aws_iam_role.deployment_operator.arn
}
