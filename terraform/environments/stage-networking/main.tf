locals {
  tags = merge(
    {
      Project     = "MADAR"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "platform"
      Layer       = "networking"
    },
    var.tags
  )

  public_subnets = [
    { cidr = "10.40.0.0/24", az = var.azs[0] },
    { cidr = "10.40.1.0/24", az = var.azs[1] }
  ]

  application_subnets = [
    { cidr = "10.40.16.0/24", az = var.azs[0] },
    { cidr = "10.40.17.0/24", az = var.azs[1] }
  ]

  data_subnets = [
    { cidr = "10.40.32.0/24", az = var.azs[0] },
    { cidr = "10.40.33.0/24", az = var.azs[1] }
  ]
}

module "vpc" {
  source = "../../modules/vpc"

  name_prefix         = var.name_prefix
  vpc_cidr            = var.vpc_cidr
  public_subnets      = local.public_subnets
  private_subnets     = []
  application_subnets = local.application_subnets
  data_subnets        = local.data_subnets
  nat_gateway_count   = 1
  tags                = local.tags
}

resource "aws_security_group" "app_tasks" {
  name        = "${var.name_prefix}-app-tasks"
  description = "Reusable security group for future ECS tasks"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-app-tasks"
  })
}

resource "aws_security_group" "database" {
  name        = "${var.name_prefix}-database"
  description = "Reusable security group for future RDS data tier"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-database"
  })
}

resource "aws_security_group" "redis" {
  name        = "${var.name_prefix}-redis"
  description = "Reusable security group for future ElastiCache Redis tier"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-redis"
  })
}
