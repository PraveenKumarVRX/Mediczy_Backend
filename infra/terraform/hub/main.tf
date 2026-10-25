/**
 * Mediqzy hub-side Transit Gateway for multi-tenant network isolation.
 *
 * Phase 1 only (per docs/architecture - the tenant-isolation plan this
 * session approved): creates the TGW and attaches it to the existing
 * default VPC that already hosts the live production EC2 instance
 * (i-0a1e08556143f4b03). Attaching a VPC to a TGW only adds an ENI per
 * subnet - it does not touch, restart, or reconfigure the running
 * instance, and does not change its existing Cloudflare -> nginx traffic
 * path at all.
 *
 * Deliberately NOT included here: any RAM share to a tenant account, any
 * tenant-side route table, any SG change. Those are Phase 2+ (per-tenant,
 * e.g. infra/terraform/tenant/medstar/), applied only once the tenant's
 * account owner has confirmed they can accept a RAM share and attach
 * their own VPC.
 */

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

variable "hub_vpc_id" {
  description = "Existing default VPC that already hosts the live production EC2 instance"
  type        = string
  default     = "vpc-054ee1d2e6abd1ba4"
}

variable "hub_attachment_subnet_ids" {
  description = "One subnet per AZ used for the TGW's ENIs in the hub VPC (does not affect existing instances)"
  type        = list(string)
  default     = ["subnet-0bd5e4eddec91fc71", "subnet-03ca64b071a664466"] # ap-south-1a, ap-south-1b
}

resource "aws_ec2_transit_gateway" "hub" {
  description                    = "Mediqzy hub TGW - per-tenant isolated spokes, no tenant-to-tenant routing"
  amazon_side_asn                = 64512
  auto_accept_shared_attachments  = "disable" # tenant attachments must be explicitly accepted, never auto
  default_route_table_association = "disable" # every attachment gets its OWN route table (isolation)
  default_route_table_propagation = "disable"
  dns_support                     = "enable"

  tags = {
    Name    = "mediqzy-hub-tgw"
    Project = "mediqzy-tenant-isolation"
  }
}

resource "aws_ec2_transit_gateway_vpc_attachment" "hub_vpc" {
  transit_gateway_id = aws_ec2_transit_gateway.hub.id
  vpc_id              = var.hub_vpc_id
  subnet_ids           = var.hub_attachment_subnet_ids
  dns_support           = "enable"

  tags = {
    Name = "mediqzy-hub-vpc-attachment"
  }
}

# The hub's own TGW route table - propagates/associates with the hub VPC
# attachment only. Tenant attachments each get a SEPARATE route table
# (defined per-tenant, not here) so no tenant ever shares a route table
# with another tenant or with anything beyond "route to hub."
resource "aws_ec2_transit_gateway_route_table" "hub" {
  transit_gateway_id = aws_ec2_transit_gateway.hub.id
  tags = {
    Name = "mediqzy-hub-route-table"
  }
}

resource "aws_ec2_transit_gateway_route_table_association" "hub_vpc" {
  transit_gateway_attachment_id = aws_ec2_transit_gateway_vpc_attachment.hub_vpc.id
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.hub.id
}

resource "aws_ec2_transit_gateway_route_table_propagation" "hub_vpc" {
  transit_gateway_attachment_id = aws_ec2_transit_gateway_vpc_attachment.hub_vpc.id
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.hub.id
}

output "transit_gateway_id" {
  value = aws_ec2_transit_gateway.hub.id
}

output "hub_route_table_id" {
  value = aws_ec2_transit_gateway_route_table.hub.id
}

output "hub_vpc_attachment_id" {
  value = aws_ec2_transit_gateway_vpc_attachment.hub_vpc.id
}
