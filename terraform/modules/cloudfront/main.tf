resource "aws_cloudfront_origin_access_control" "this" {
  count = var.enable_assets_bucket_origin ? 1 : 0

  name                              = "${var.name_prefix}-oac"
  description                       = "OAC for assets bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name_prefix} distribution"
  default_root_object = "index.html"
  aliases             = var.aliases

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  dynamic "origin" {
    for_each = var.enable_assets_bucket_origin ? [1] : []

    content {
      domain_name              = var.assets_bucket_regional_domain_name
      origin_id                = "assets-origin"
      origin_access_control_id = aws_cloudfront_origin_access_control.this[0].id
    }
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "alb-origin"

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = true

      headers = ["Authorization", "Host", "Origin", "CloudFront-Viewer-Country"]

      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 31536000
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.enable_assets_bucket_origin ? [1] : []

    content {
      path_pattern     = "/assets/*"
      allowed_methods  = ["GET", "HEAD", "OPTIONS"]
      cached_methods   = ["GET", "HEAD"]
      target_origin_id = "assets-origin"

      viewer_protocol_policy = "redirect-to-https"
      compress               = true

      forwarded_values {
        query_string = false

        cookies {
          forward = "none"
        }
      }

      min_ttl     = 0
      default_ttl = 86400
      max_ttl     = 31536000
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-cloudfront"
  })
}
