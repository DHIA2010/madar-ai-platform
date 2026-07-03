output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "redis_reader_endpoint" {
  value = aws_elasticache_replication_group.this.reader_endpoint_address
}

output "redis_cluster_id" {
  value = aws_elasticache_replication_group.this.replication_group_id
}

output "redis_security_group_id" {
  value = aws_security_group.redis.id
}
