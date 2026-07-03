output "ecr_app_repository_url" {
  description = "URL of the ECR application repository"
  value       = aws_ecr_repository.app.repository_url
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "app_service_name" {
  description = "Name of the application ECS service"
  value       = aws_ecs_service.app.name
}

output "cloudwatch_app_log_group" {
  description = "CloudWatch log group for application"
  value       = aws_cloudwatch_log_group.app.name
}
