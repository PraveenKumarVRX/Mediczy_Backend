# Medstar network preflight — 25 October 2026

Reviewed the updated Claude hub-and-spoke plan (`/home/ubuntu/.claude/plans/playful-weaving-rocket.md`), the recent Claude session and `infra/terraform/hub/main.tf`. The saved `hub.tfplan` represents a proposed first phase, not an applied network. AWS EC2 inspection found no Transit Gateways in the current Mediqzy account in `ap-south-1`.

| Verified resource | Identity | IPv4 CIDR |
|---|---|---|
| Mediqzy hub account | `480664947830`, VPC `vpc-054ee1d2e6abd1ba4` | `172.31.0.0/16` |
| Medstar account | `863162197383`, VPC `vpc-07e0236afc05d36c0` | `172.31.0.0/16` |

The Mediqzy CIDR was read from the EC2 API; the Medstar VPC identity and CIDR were read from its instance metadata over the authorized SSH connection. This does not require or establish cross-account AWS API credentials.

The proposed direct hub-to-spoke routing cannot be applied as written: both VPCs have identical address space. AWS documents that ordinary Transit Gateway VPC routing does not support identical/overlapping VPC ranges; overlapping attachments do not propagate their routes ([VPC attachment documentation](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html)).

Before provisioning this topology, choose and verify a non-overlapping address plan for the connected VPCs, or explicitly design supported address translation. AWS also documents [Transit Gateway 1:1 NAT](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-nat-how-it-works.html); it is an option to evaluate, not something included in the existing Terraform plan. Verify regional availability, provider/API support, unique translated ranges, return routes, tenant separation and cost before selecting it. Do not assume relocating an existing EC2 instance between VPCs is an in-place change.

The network plan correctly distinguishes tenant internet ingress (DNS/TLS/load balancer) from private management connectivity. A Transit Gateway alone does not update Cloudflare DNS, issue a web certificate, grant cross-account IAM permissions, or activate the application. No DNS-provider credential or delegated Medstar AWS role was found in the reviewed update. SSH application deployment and outbound authenticated reporting work independently of this unfinished network layer.

No Terraform apply, RAM share, VPC attachment, route/security-group edit or public DNS cutover was performed in this preflight. The isolated CRM remains available through its loopback-only web proxy and SSH forwarding. Finish the addressing decision and tenant-account delegation before applying the hub/spoke plan; leave the working Mediqzy and Medstar servers in place during that work.
