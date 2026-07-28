locals {
  app_domain = "${var.app_subdomain}.${var.domain_name}"
  api_domain = "${var.api_subdomain}.${var.domain_name}"

  tags = {
    Project     = "madar"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "platform"
    DataClass   = "confidential"
    Compliance  = "required"
  }
}

module "vpc" {
  source = "../../modules/vpc"

  name_prefix = var.name_prefix
  vpc_cidr    = "10.50.0.0/16"

  public_subnets = [
    { cidr = "10.50.1.0/24", az = "${var.aws_region}a" },
    { cidr = "10.50.2.0/24", az = "${var.aws_region}b" }
  ]

  private_subnets = [
    { cidr = "10.50.11.0/24", az = "${var.aws_region}a" },
    { cidr = "10.50.12.0/24", az = "${var.aws_region}b" }
  ]

  tags = local.tags
}

module "ecr" {
  source      = "../../modules/ecr"
  name_prefix = var.name_prefix
  tags        = local.tags
}

module "secrets" {
  source      = "../../modules/secrets"
  name_prefix = var.name_prefix
  tags        = local.tags

  secrets = {
    "db-master"                 = { value = jsonencode({ password = var.db_master_password }) }
    "oauth-google"              = { value = null }
    "oauth-meta"                = { value = null }
    "webhook-signing-key"       = { value = null }
    "jwt-signing-key"           = { value = null }
    "redis-auth-token"          = { value = null }
    "frontend-session-secret"   = { value = null }
    "backend-encryption-secret" = { value = null }
  }
}

module "iam" {
  source = "../../modules/iam"

  name_prefix                    = var.name_prefix
  github_oidc_provider_arn       = var.github_oidc_provider_arn
  github_repository              = var.github_repository
  deployment_operator_principals = var.deployment_operator_principals
  runtime_secret_arns            = values(module.secrets.secret_arns)

  terraform_state_resource_arns = [
    "arn:aws:s3:::${var.terraform_state_bucket_name}",
    "arn:aws:s3:::${var.terraform_state_bucket_name}/*"
  ]

  tags = local.tags
}

module "acm_alb" {
  source = "../../modules/acm"

  name_prefix               = "${var.name_prefix}-alb"
  domain_name               = local.api_domain
  subject_alternative_names = []
  hosted_zone_id            = var.hosted_zone_id
  tags                      = local.tags
}

module "acm_cloudfront" {
  source = "../../modules/acm"

  providers = {
    aws = aws.use1
  }

  name_prefix               = "${var.name_prefix}-cf"
  domain_name               = local.app_domain
  subject_alternative_names = []
  hosted_zone_id            = var.hosted_zone_id
  tags                      = local.tags
}

module "alb" {
  source = "../../modules/alb"

  name_prefix                = var.name_prefix
  vpc_id                     = module.vpc.vpc_id
  public_subnet_ids          = module.vpc.public_subnet_ids
  acm_certificate_arn        = module.acm_alb.certificate_arn
  enable_deletion_protection = true
  tags                       = local.tags
}

resource "aws_s3_bucket" "assets" {
  bucket = "${var.name_prefix}-assets"

  tags = merge(local.tags, {
    Name = "${var.name_prefix}-assets"
  })
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

module "cloudfront" {
  source = "../../modules/cloudfront"

  name_prefix                        = var.name_prefix
  alb_dns_name                       = module.alb.alb_dns_name
  acm_certificate_arn                = module.acm_cloudfront.certificate_arn
  aliases                            = [local.app_domain]
  enable_assets_bucket_origin        = true
  assets_bucket_regional_domain_name = aws_s3_bucket.assets.bucket_regional_domain_name
  tags                               = local.tags
}

module "rds" {
  source = "../../modules/rds"

  name_prefix                = var.name_prefix
  vpc_id                     = module.vpc.vpc_id
  private_subnet_ids         = module.vpc.private_subnet_ids
  allowed_cidr_blocks        = [module.vpc.vpc_cidr]
  master_password_secret_arn = module.secrets.secret_arns["db-master"]
  instance_class             = "db.m7g.large"
  multi_az                   = true
  deletion_protection        = true
  backup_retention_days      = 30
  tags                       = local.tags
}

module "redis" {
  source = "../../modules/redis"

  name_prefix                = var.name_prefix
  vpc_id                     = module.vpc.vpc_id
  private_subnet_ids         = module.vpc.private_subnet_ids
  allowed_cidr_blocks        = [module.vpc.vpc_cidr]
  node_type                  = "cache.m7g.large"
  num_cache_nodes            = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  tags                       = local.tags
}

module "cloudwatch" {
  source = "../../modules/cloudwatch"

  name_prefix           = var.name_prefix
  environment           = var.environment
  region                = var.aws_region
  alb_arn_suffix        = module.alb.alb_arn_suffix
  alarm_email_endpoints = var.alarm_email_endpoints
  log_retention_days    = 90
  tags                  = local.tags
}

module "ecs" {
  source = "../../modules/ecs"

  name_prefix               = var.name_prefix
  region                    = var.aws_region
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  alb_security_group_id     = module.alb.alb_security_group_id
  frontend_target_group_arn = module.alb.frontend_target_group_arn
  backend_target_group_arn  = module.alb.backend_target_group_arn
  execution_role_arn        = module.iam.ecs_task_execution_role_arn
  runtime_role_arn          = module.iam.ecs_task_runtime_role_arn
  frontend_image            = var.frontend_image
  backend_image             = var.backend_image
  frontend_log_group_name   = module.cloudwatch.frontend_log_group_name
  backend_log_group_name    = module.cloudwatch.backend_log_group_name

  frontend_environment = {
    NODE_ENV                     = "production"
    NEXT_PUBLIC_APP_URL          = "https://${local.app_domain}"
    NEXT_PUBLIC_API_BASE_URL     = "https://${local.api_domain}"
    NEXT_PUBLIC_APP_RUNTIME_MODE = "production"
  }

  backend_environment = {
    NODE_ENV         = "production"
    APP_ENV          = "production"
    PORT             = "4000"
    DB_HOST          = module.rds.db_endpoint
    DB_PORT          = tostring(module.rds.db_port)
    DB_NAME          = "madar"
    DB_USER          = "madar_admin"
    REDIS_HOST       = module.redis.redis_primary_endpoint
    REDIS_PORT       = "6379"
    S3_BUCKET_ASSETS = aws_s3_bucket.assets.bucket
  }

  backend_secrets = [
    {
      name       = "DB_PASSWORD"
      value_from = module.secrets.secret_arns["db-master"]
    },
    {
      name       = "JWT_SIGNING_KEY"
      value_from = module.secrets.secret_arns["jwt-signing-key"]
    }
  ]

  frontend_secrets = [
    {
      name       = "SESSION_SECRET"
      value_from = module.secrets.secret_arns["frontend-session-secret"]
    }
  ]

  frontend_desired_count = 3
  backend_desired_count  = 3
  frontend_min_count     = 3
  frontend_max_count     = 10
  backend_min_count      = 3
  backend_max_count      = 10

  tags = local.tags
}

module "route53" {
  source = "../../modules/route53"

  hosted_zone_id     = var.hosted_zone_id
  app_domain_name    = local.app_domain
  api_domain_name    = local.api_domain
  app_alias_dns_name = module.cloudfront.distribution_domain_name
  app_alias_zone_id  = module.cloudfront.distribution_hosted_zone_id
  api_alias_dns_name = module.alb.alb_dns_name
  api_alias_zone_id  = module.alb.alb_zone_id
}
