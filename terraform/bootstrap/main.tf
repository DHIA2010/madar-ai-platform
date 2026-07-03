data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  role_name = "${var.project_name}-terraform-deploy"

  git_config_content = file("${path.root}/../../.git/config")
  origin_url_matches = regexall("(?ms)\\[remote \"origin\"\\][^\\[]*?url\\s*=\\s*([^\\n\\r]+)", local.git_config_content)
  origin_url         = length(local.origin_url_matches) > 0 ? trimspace(local.origin_url_matches[0][0]) : ""
  origin_url_no_git  = trimsuffix(local.origin_url, ".git")

  github_repository_from_origin = trimprefix(
    trimprefix(local.origin_url_no_git, "https://github.com/"),
    "git@github.com:"
  )

  github_repository = var.github_repository_override != "" ? var.github_repository_override : local.github_repository_from_origin

  default_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "platform"
    Layer       = "bootstrap"
  }

  tags = merge(local.default_tags, var.tags)

  github_subjects = concat(
    [for branch in var.github_allowed_branches : "repo:${local.github_repository}:ref:refs/heads/${branch}"],
    [for env in var.github_allowed_environments : "repo:${local.github_repository}:environment:${env}"]
  )
}

resource "terraform_data" "github_repository_validation" {
  input = local.github_repository

  lifecycle {
    precondition {
      condition     = length(local.origin_url_matches) > 0 || var.github_repository_override != ""
      error_message = "Could not resolve git remote origin URL from repository metadata. Set github_repository_override temporarily if needed."
    }

    precondition {
      condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", local.github_repository))
      error_message = "Resolved repository must be in owner/repo format for GitHub OIDC trust subjects."
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}

resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for MADAR Terraform state encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/${var.project_name}/terraform-state"
  target_key_id = aws_kms_key.terraform_state.key_id
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_ownership_controls" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.terraform_state.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  depends_on = [aws_s3_bucket_ownership_controls.terraform_state]

  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "terraform_state_bucket_policy" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*"
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = data.aws_iam_policy_document.terraform_state_bucket_policy.json
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["22ff89586561fc2d52f77491e9f1eff1b80be33e"]
}

data "aws_iam_policy_document" "terraform_assume_role" {
  depends_on = [terraform_data.github_repository_validation]

  statement {
    sid    = "AllowGitHubActionsAssumeRole"
    effect = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    actions = ["sts:AssumeRoleWithWebIdentity"]

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_subjects
    }
  }
}

resource "aws_iam_role" "terraform_deploy" {
  name               = local.role_name
  description        = "Terraform deployment role assumed by GitHub Actions via OIDC"
  assume_role_policy = data.aws_iam_policy_document.terraform_assume_role.json
}

data "aws_iam_policy_document" "terraform_state_access" {
  statement {
    sid    = "AllowStateBucketReadWrite"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketVersioning",
      "s3:GetEncryptionConfiguration"
    ]

    resources = [aws_s3_bucket.terraform_state.arn]
  }

  statement {
    sid    = "AllowStateObjectReadWrite"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]

    resources = ["${aws_s3_bucket.terraform_state.arn}/${var.state_key_prefix}/*"]
  }

  statement {
    sid    = "AllowStateKmsUsage"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:DescribeKey"
    ]

    resources = [aws_kms_key.terraform_state.arn]
  }
}

resource "aws_iam_policy" "terraform_state_access" {
  name        = "${var.project_name}-terraform-state-access"
  description = "Least-privilege access to MADAR Terraform state bucket and key"
  policy      = data.aws_iam_policy_document.terraform_state_access.json
}

resource "aws_iam_role_policy_attachment" "terraform_state_access" {
  role       = aws_iam_role.terraform_deploy.name
  policy_arn = aws_iam_policy.terraform_state_access.arn
}
