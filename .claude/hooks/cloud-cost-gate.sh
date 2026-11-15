#!/usr/bin/env bash
# Cloud cost gate (PreToolUse hook on Bash) — docs/operations/CLOUD_COST_POLICY.md
#
# Any command that can create or enlarge a billed cloud resource stops for an
# explicit human "yes": the agent (Claude or any other) must first state what
# it will create or enlarge, the monthly cost, and why. Everything else passes
# silently. Monthly budget target: USD 333 (set 2026-11-15).
#
# Reads the hook JSON on stdin; prints a permissionDecision "ask" on a match.
set -u
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

# One line, lower case, so flags split across lines still match.
c="$(printf '%s' "$cmd" | tr '\n' ' ' | tr '[:upper:]' '[:lower:]')"

patterns=(
  # AWS compute, storage, network
  'aws +ec2 +(run-instances|start-instances|request-spot-instances|allocate-address|create-volume|modify-volume|create-nat-gateway|create-image|copy-image|copy-snapshot|create-snapshot|create-vpc-endpoint|create-transit-gateway|purchase-reserved-instances-offering|create-capacity-reservation)'
  'aws +ec2 +modify-instance-attribute.*instance-type'
  # AWS databases and caches
  'aws +rds +(create-db-|restore-db-|start-db-|copy-db-snapshot|purchase-reserved-db-instances-offering|create-db-instance-read-replica)'
  'aws +rds +modify-db-(instance|cluster).*(db-instance-class|multi-az|allocated-storage|iops|storage-type|max-allocated-storage)'
  'aws +(elasticache|memorydb|docdb|neptune|redshift|opensearch|es|dynamodb) +(create-|modify-replication-group|increase-replica-count|update-table)'
  # AWS load balancing, containers, scaling
  'aws +(elbv2|elb) +create-load-balancer'
  'aws +ecs +(create-service|create-cluster|run-task|start-task)'
  'aws +ecs +update-service.*desired-count'
  'aws +autoscaling +(create-auto-scaling-group|set-desired-capacity|update-auto-scaling-group|put-scaling-policy)'
  'aws +(eks|lightsail|globalaccelerator|cloudfront|sagemaker|batch|emr|kafka|mq|transfer|workspaces|appstream) +(create-|start-|run-)'
  'aws +lambda +put-provisioned-concurrency-config'
  # AWS commitments and paid add-ons
  'aws +(savingsplans|ce) +(create-savings-plan|purchase)'
  'aws +(kms +create-key|secretsmanager +create-secret|route53 +create-hosted-zone|backup +create-backup-plan)'
  # Infrastructure-as-code applies
  '(^|[;&| ])(terraform|tofu) +apply'
  '(^|[;&| ])pulumi +up'
  '(^|[;&| ])(cdk|cdktf) +deploy'
  '(^|[;&| ])(sam|copilot|serverless|sls) +deploy'
  '(^|[;&| ])eksctl +(create|scale)'
  # Other clouds
  '(^|[;&| ])gcloud +.*(create|resize|scale)( |$)'
  '(^|[;&| ])az +.*(create|scale|resize)( |$)'
  # More processes on the production box
  '(^|[;&| ])pm2 +scale '
)

for p in "${patterns[@]}"; do
  if printf '%s' "$c" | grep -Eq -- "$p"; then
    reason="Cloud cost gate: this command can create or enlarge a billed resource. Monthly AWS budget is USD 333 (docs/operations/CLOUD_COST_POLICY.md). Before approving, the agent must state what it creates or enlarges, its monthly cost, and why — and the owner must explicitly say yes."
    jq -n --arg r "$reason" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: $r,
        additionalContext: "Cost gate triggered. Do not retry or work around this. Tell the user, in plain words, what this command creates or enlarges, its estimated monthly cost in USD, and why it is needed; wait for an explicit yes. Prefer the smallest size and remove anything temporary afterwards."
      }
    }'
    exit 0
  fi
done
exit 0
