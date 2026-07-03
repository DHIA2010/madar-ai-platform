resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-igw"
  })
}

locals {
  public_subnets      = { for idx, subnet in var.public_subnets : tostring(idx) => subnet }
  private_subnets     = { for idx, subnet in var.private_subnets : tostring(idx) => subnet }
  application_subnets = { for idx, subnet in var.application_subnets : tostring(idx) => subnet }
  data_subnets        = { for idx, subnet in var.data_subnets : tostring(idx) => subnet }
  nat_gateway_keys    = [for idx in range(var.nat_gateway_count) : tostring(idx)]
}

resource "aws_subnet" "public" {
  for_each = local.public_subnets

  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-${each.key}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  for_each = local.private_subnets

  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-${each.key}"
    Tier = "private"
  })
}

resource "aws_subnet" "application" {
  for_each = local.application_subnets

  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-application-${each.key}"
    Tier = "application"
  })
}

resource "aws_subnet" "data" {
  for_each = local.data_subnets

  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-data-${each.key}"
    Tier = "data"
  })
}

resource "aws_eip" "nat" {
  for_each = { for idx, subnet in local.public_subnets : idx => subnet if tonumber(idx) < var.nat_gateway_count }

  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-nat-eip-${each.key}"
  })
}

resource "aws_nat_gateway" "this" {
  for_each = aws_eip.nat

  allocation_id = each.value.id
  subnet_id     = aws_subnet.public[each.key].id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-nat-${each.key}"
  })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  for_each = aws_subnet.private

  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[local.nat_gateway_keys[tonumber(each.key) % var.nat_gateway_count]].id
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-${each.key}-rt"
  })
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}

resource "aws_route_table" "application" {
  for_each = aws_subnet.application

  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[local.nat_gateway_keys[tonumber(each.key) % var.nat_gateway_count]].id
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-application-${each.key}-rt"
  })
}

resource "aws_route_table_association" "application" {
  for_each = aws_subnet.application

  subnet_id      = each.value.id
  route_table_id = aws_route_table.application[each.key].id
}

resource "aws_route_table" "data" {
  for_each = aws_subnet.data

  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[local.nat_gateway_keys[tonumber(each.key) % var.nat_gateway_count]].id
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-data-${each.key}-rt"
  })
}

resource "aws_route_table_association" "data" {
  for_each = aws_subnet.data

  subnet_id      = each.value.id
  route_table_id = aws_route_table.data[each.key].id
}
