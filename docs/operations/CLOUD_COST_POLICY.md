# Cloud cost policy

Owner: My SmartHealth. Set 2026-11-15. Applies to people and to every AI agent (Claude, Codex, others).

**Monthly AWS budget: USD 333**, the July–August 2026 level. The bill reached $451 in September
and $554 in October because resources were added and old ones were never removed.

## The rule

No agent creates or enlarges a billed resource on its own. Before anything that adds cost, the
agent states in plain words:

1. what it will create or enlarge, and where;
2. the estimated monthly cost in USD;
3. why it is needed, and what will be removed (or when).

The owner then says yes or no. Temporary resources get a removal date. This covers new servers
or databases, bigger instance sizes, Multi-AZ, more storage or IOPS, load balancers, NAT
gateways, Elastic IPs, snapshots or images, container services, scaling up, reserved capacity or
Savings Plans, and any infrastructure-as-code apply.

Stopping, shrinking and deleting things is not gated — but deleting data (databases, snapshots,
buckets) still needs the owner's yes, and a final snapshot first.

## How it is enforced

| Layer | What it does |
|---|---|
| Claude Code hook — `.claude/hooks/cloud-cost-gate.sh`, wired in `.claude/settings.json` | Any shell command that would create or enlarge a cloud resource (`aws ec2 run-instances`, instance-type changes, `rds create/modify`, load balancers, ECS desired-count, autoscaling, `terraform apply`, `cdk deploy`, `pulumi up`, gcloud/az create, `pm2 scale`, …) stops for an explicit human yes, with this policy as the reason. |
| `CLAUDE.md` and `AGENTS.md` | State the rule for every agent working in this repository. |
| The server's AWS role (`EC2-SSM-Role`) | Has **no** permission to create, resize or delete anything, and no IAM or billing access (since 2026-11-14). Even an agent ignoring the hook cannot add cost from this server. Keep it that way: never give the app role `ec2:RunInstances`, `ec2:ModifyInstanceAttribute`, `rds:Create*`/`Modify*` or IAM rights. |
| Root keys | Both root access keys deactivated 2026-11-15. Cost-increasing changes happen only in the console, by a person. |
| AWS Budgets (set up below) | Emails when spend heads past $333, whoever caused it. |
| Explicit-deny policy (set up below) | Locks the server role out of cost-increasing actions even if someone later widens it. |

## Steps for the owner (AWS console)

### A. Budget alert (5 minutes)
1. **Billing and Cost Management → Budgets → Create budget → Cost budget**, monthly, amount **333 USD**.
2. Alerts: **80% of actual**, **100% of actual**, and **100% of forecasted**, to your billing email.

### B. Lock the server role out of cost-increasing actions
**IAM → Roles → EC2-SSM-Role → Add permissions → Create inline policy → JSON**, name it `DenyCostIncrease`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyCostIncrease",
    "Effect": "Deny",
    "Action": [
      "ec2:RunInstances", "ec2:StartInstances", "ec2:ModifyInstanceAttribute", "ec2:AllocateAddress",
      "ec2:CreateVolume", "ec2:ModifyVolume", "ec2:CreateNatGateway", "ec2:CreateImage", "ec2:CopyImage",
      "ec2:CopySnapshot", "ec2:PurchaseReservedInstancesOffering", "ec2:RequestSpotInstances",
      "rds:CreateDBInstance", "rds:CreateDBCluster", "rds:ModifyDBInstance", "rds:ModifyDBCluster",
      "rds:RestoreDBInstance*", "rds:PurchaseReservedDBInstancesOffering",
      "elasticloadbalancing:CreateLoadBalancer", "ecs:CreateService", "ecs:UpdateService", "ecs:RunTask",
      "autoscaling:*", "lightsail:Create*", "eks:Create*", "savingsplans:CreateSavingsPlan",
      "iam:*"
    ],
    "Resource": "*"
  }]
}
```

### C. Cost clean-up (after the old database is deleted and SmartCRM resized)
| # | Action | Console path | Saves / month |
|---|---|---|---|
| 1 | Delete the idle load balancer `mediczy-alb` (no targets, 0 requests in 14 days) | EC2 → Load Balancers → `mediczy-alb` → Actions → Delete. Then Target Groups → delete `mediczy-control-plane-tg` and `mediczy-fargate-tg` | ~$18 |
| 2 | Release both spare Elastic IPs: `13.127.155.54` (attached to nothing) and `3.109.40.182` (it was on the load balancer) | EC2 → Elastic IPs → select → Actions → Release | ~$7 |
| 3 | Delete the September SmartCRM image, if the SmartCRM team confirms it is not needed | EC2 → AMIs → `ami-07f85ec4dd518e231` → Deregister; then Snapshots → `snap-098c8e0928dc2b022` → Delete | ~$6 |
| 4 | Prune old RDS manual snapshots (the UAT ones from May–July, and pre-release ones older than 30 days) — keep `mediczy-prod-final-20261115` and the latest pre-release of each kind | RDS → Snapshots → Manual | small; matters once the old DB's free backup allowance is gone |

Recreate the load balancer when the move to mediczy.in on ECS actually starts; it takes minutes.

### D. Commitments (after clean-up has run for a week)
Usage must be stable first, or you commit to the wrong size.
1. **Compute Savings Plan**: Billing → Savings Plans → **Recommendations** → Compute Savings Plans, **1 year, No upfront**, lookback 7 days → purchase the recommended hourly commitment. It covers both servers whatever their size or family. Roughly 25–30% off EC2.
2. **RDS reserved instance**: RDS → Reserved instances → Purchase → PostgreSQL, **db.t4g.medium, Multi-AZ, 1 year, No upfront**, ap-south-1, quantity 1. Roughly 30% off the database.

### Where this lands (USD per month, including GST)
| Step | Monthly |
|---|---|
| November run-rate | ~590 |
| Old database deleted + SmartCRM resized to t3.large | ~430 |
| + clean-up C1–C3 | ~395 |
| + Savings Plan and RDS reserved instance | ~300–320 |

Not recommended: dropping Multi-AZ on the production database (patient data, availability),
or shrinking the Mediqzy server on CPU figures alone (it is memory-bound and has run out of memory before).
