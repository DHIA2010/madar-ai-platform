data "terraform_remote_state" "networking" {
  backend = "s3"

  config = {
    bucket       = "madar-terraform-state-160450753643"
    key          = "stage/network.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
    encrypt      = true
  }
}

locals {
  tags = merge(
    {
      Project     = "MADAR"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "platform"
      Layer       = "platform"
    },
    var.tags
  )

  vpc_id                 = data.terraform_remote_state.networking.outputs.vpc_id
  application_subnet_ids = data.terraform_remote_state.networking.outputs.application_subnet_ids
  public_subnet_ids      = data.terraform_remote_state.networking.outputs.public_subnet_ids
  app_tasks_sg_id        = data.terraform_remote_state.networking.outputs.security_group_ids.app_tasks

  app_name = "${var.name_prefix}-app"
}

# ECR repository for application
resource "aws_ecr_repository" "app" {
  name                 = "${var.name_prefix}/app"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-app-repo"
  })
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/ecs/${local.app_name}"
  retention_in_days = 7

  tags = merge(local.tags, {
    Name = "${local.app_name}-logs"
  })
}

# Secrets Manager for minimum required secrets
resource "aws_secretsmanager_secret" "app_session_secret" {
  name                    = "${var.name_prefix}/app-session-secret"
  recovery_window_in_days = 7

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-app-session-secret"
  })
}

resource "aws_secretsmanager_secret_version" "app_session_secret" {
  secret_id     = aws_secretsmanager_secret.app_session_secret.id
  secret_string = base64encode(random_password.app_session_secret.result)
}

resource "random_password" "app_session_secret" {
  length  = 32
  special = true
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-cluster"
  })
}



# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.name_prefix}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow ECR pull, CloudWatch logs, and Secrets Manager access
resource "aws_iam_role_policy" "ecs_task_execution_ecr_cloudwatch_secrets" {
  name = "${var.name_prefix}-ecs-task-execution-policy"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          aws_cloudwatch_log_group.app.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.app_session_secret.arn
        ]
      }
    ]
  })
}

# IAM Role for ECS Task Runtime (application permissions)
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.name_prefix}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.tags
}

# Application Load Balancer
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb-sg"
  description = "Security group for ALB"
  vpc_id      = local.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-alb-sg"
  })
}

resource "aws_lb" "main" {
  name               = "${var.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.public_subnet_ids

  enable_deletion_protection = false

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-alb"
  })
}

# Target Group
resource "aws_lb_target_group" "app" {
  name        = "${var.name_prefix}-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 3
    interval            = 30
    path                = "/"
    matcher             = "200"
  }

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-tg"
  })
}

# ALB Listener (HTTP)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# Allow ALB to reach ECS tasks
resource "aws_security_group_rule" "alb_to_app_tasks" {
  type                     = "ingress"
  from_port                = var.app_port
  to_port                  = var.app_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  security_group_id        = local.app_tasks_sg_id
}

# ECS Task Definition
resource "aws_ecs_task_definition" "app" {
  family                   = local.app_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name      = local.app_name
    image     = "${aws_ecr_repository.app.repository_url}:${var.app_image_tag}"
    essential = true
    portMappings = [{
      containerPort = var.app_port
      hostPort      = var.app_port
      protocol      = "tcp"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
    environment = [
      {
        name  = "NODE_ENV"
        value = "production"
      },
      {
        name  = "NEXT_PUBLIC_APP_RUNTIME_MODE"
        value = "stage"
      }
    ]
  }])

  tags = merge(local.tags, {
    Name = "${local.app_name}-task-def"
  })
}

# ECS Service
resource "aws_ecs_service" "app" {
  name            = "${local.app_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.app_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.application_subnet_ids
    security_groups  = [local.app_tasks_sg_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = local.app_name
    container_port   = var.app_port
  }

  depends_on = [
    aws_lb_listener.http,
    aws_security_group_rule.alb_to_app_tasks
  ]

  tags = merge(local.tags, {
    Name = "${local.app_name}-service"
  })
}
