# Instructions for AI agents (Codex and others)

Read `CLAUDE.md` for the codebase conventions; they apply to every agent, not only Claude.

## Cloud cost gate — mandatory

Monthly AWS budget: **USD 333**. Never create or enlarge a billed cloud resource on your own:
new servers or databases, bigger instance types, Multi-AZ, more storage or IOPS, load balancers,
NAT gateways, Elastic IPs, snapshots or images, ECS services or desired counts, autoscaling,
reserved capacity or Savings Plans, `terraform apply`, `cdk deploy`, `pulumi up`, gcloud/az create,
`pm2 scale`.

Before any of these, tell the owner what you will create or enlarge, its estimated monthly cost
in USD, and why — then wait for an explicit yes. Remove temporary resources afterwards.
Full policy: `docs/operations/CLOUD_COST_POLICY.md`.

## Other standing rules
- Never call the public app backend (`app.mediqzy.com`) from scripts or tests; use `http://localhost:8888`.
- Never `git reset --hard` the shared working tree; commit with explicit paths (`git commit -- <paths>`).
- Never write `[deploy-prod]` in a commit message.
- Run the test suite as its own step and read the result before any commit, push or reload.
