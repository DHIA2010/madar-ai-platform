output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  value = [for idx in sort(keys(aws_subnet.public)) : aws_subnet.public[idx].id]
}

output "private_subnet_ids" {
  value = [for idx in sort(keys(aws_subnet.private)) : aws_subnet.private[idx].id]
}

output "application_subnet_ids" {
  value = [for idx in sort(keys(aws_subnet.application)) : aws_subnet.application[idx].id]
}

output "data_subnet_ids" {
  value = [for idx in sort(keys(aws_subnet.data)) : aws_subnet.data[idx].id]
}

output "vpc_cidr" {
  value = aws_vpc.this.cidr_block
}

output "public_route_table_id" {
  value = aws_route_table.public.id
}

output "private_route_table_ids" {
  value = [for idx in sort(keys(aws_route_table.private)) : aws_route_table.private[idx].id]
}

output "application_route_table_ids" {
  value = [for idx in sort(keys(aws_route_table.application)) : aws_route_table.application[idx].id]
}

output "data_route_table_ids" {
  value = [for idx in sort(keys(aws_route_table.data)) : aws_route_table.data[idx].id]
}

output "internet_gateway_id" {
  value = aws_internet_gateway.this.id
}

output "nat_gateway_id" {
  value = try(aws_nat_gateway.this[sort(keys(aws_nat_gateway.this))[0]].id, null)
}

output "nat_gateway_ids" {
  value = [for idx in sort(keys(aws_nat_gateway.this)) : aws_nat_gateway.this[idx].id]
}
