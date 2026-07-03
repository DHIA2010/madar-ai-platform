output "vpc_id" {
  description = "VPC identifier"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet identifiers"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet identifiers"
  value       = module.vpc.private_subnet_ids
}

output "application_subnet_ids" {
  description = "Application subnet identifiers"
  value       = module.vpc.application_subnet_ids
}

output "data_subnet_ids" {
  description = "Data subnet identifiers"
  value       = module.vpc.data_subnet_ids
}

output "public_route_table_id" {
  description = "Public route table identifier"
  value       = module.vpc.public_route_table_id
}

output "private_route_table_ids" {
  description = "Private route table identifiers"
  value       = module.vpc.private_route_table_ids
}

output "application_route_table_ids" {
  description = "Application route table identifiers"
  value       = module.vpc.application_route_table_ids
}

output "data_route_table_ids" {
  description = "Data route table identifiers"
  value       = module.vpc.data_route_table_ids
}

output "route_table_ids" {
  description = "All route table identifiers"
  value = concat(
    [module.vpc.public_route_table_id],
    module.vpc.application_route_table_ids,
    module.vpc.data_route_table_ids,
    module.vpc.private_route_table_ids
  )
}

output "nat_gateway_id" {
  description = "Primary NAT gateway identifier"
  value       = module.vpc.nat_gateway_id
}

output "nat_gateway_ids" {
  description = "All NAT gateway identifiers"
  value       = module.vpc.nat_gateway_ids
}

output "internet_gateway_id" {
  description = "Internet gateway identifier"
  value       = module.vpc.internet_gateway_id
}

output "security_group_ids" {
  description = "Reusable security group identifiers"
  value = {
    app_tasks = aws_security_group.app_tasks.id
    database  = aws_security_group.database.id
    redis     = aws_security_group.redis.id
  }
}
