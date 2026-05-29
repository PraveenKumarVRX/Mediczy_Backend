#!/bin/bash
# =============================================================================
# setup-elasticache.sh
# Create ElastiCache Redis OSS cluster for Mediczy, print SSM param commands
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------
REGION="ap-south-1"
VPC_ID=""                         # Resolved below from subnets
SUBNET_1="subnet-0bd5e4eddec91fc71"
SUBNET_2="subnet-03ca64b071a664466"
ECS_SG="sg-0a2a2a3e0300e84fe"

ELASTICACHE_SG_NAME="mediczy-elasticache-sg"
SUBNET_GROUP_NAME="mediczy-elasticache-subnet-group"
CLUSTER_ID="mediczy-redis"
NODE_TYPE="cache.t3.micro"
ENGINE="redis"
ENGINE_VERSION="7.1"              # Redis OSS 7.x — latest stable
SSM_PREFIX="/mediczy/prod"

# Generate a random 32-char auth token (alphanumeric only — ElastiCache constraint)
AUTH_TOKEN="$(openssl rand -hex 24)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
info() { echo -e "\n\033[1;34m>>> $*\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠  $*\033[0m"; }
die()  { echo -e "\033[1;31m✖  $*\033[0m"; exit 1; }

# ---------------------------------------------------------------------------
# 0. Pre-flight
# ---------------------------------------------------------------------------
info "Pre-flight checks"
aws --version >/dev/null 2>&1 || die "AWS CLI v2 not found"
CALLER=$(aws sts get-caller-identity --query 'Arn' --output text --region "$REGION")
log "Running as: $CALLER"

# Look up VPC ID from first subnet
VPC_ID=$(aws ec2 describe-subnets \
  --subnet-ids "$SUBNET_1" \
  --region "$REGION" \
  --query 'Subnets[0].VpcId' \
  --output text)
log "VPC: $VPC_ID"

# ---------------------------------------------------------------------------
# 1. Create security group for ElastiCache
# ---------------------------------------------------------------------------
info "Step 1 — Creating security group $ELASTICACHE_SG_NAME"

EXISTING_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$ELASTICACHE_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --region "$REGION" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || echo "None")

if [[ "$EXISTING_SG" == "None" || -z "$EXISTING_SG" ]]; then
  EC_SG_ID=$(aws ec2 create-security-group \
    --group-name "$ELASTICACHE_SG_NAME" \
    --description "ElastiCache Redis access from ECS tasks only" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query 'GroupId' \
    --output text)
  ok "Security group created: $EC_SG_ID"

  # Allow TCP 6379 inbound from ECS SG only — no public access
  aws ec2 authorize-security-group-ingress \
    --group-id "$EC_SG_ID" \
    --protocol tcp \
    --port 6379 \
    --source-group "$ECS_SG" \
    --region "$REGION" >/dev/null
  ok "Inbound rule: TCP 6379 from ECS SG $ECS_SG"

  # Tag for clarity
  aws ec2 create-tags \
    --resources "$EC_SG_ID" \
    --tags Key=Name,Value="$ELASTICACHE_SG_NAME" Key=Project,Value=mediczy Key=Env,Value=prod \
    --region "$REGION"
else
  EC_SG_ID="$EXISTING_SG"
  warn "Security group already exists: $EC_SG_ID — skipping creation"
fi

# ---------------------------------------------------------------------------
# 2. Create ElastiCache subnet group
# ---------------------------------------------------------------------------
info "Step 2 — Creating ElastiCache subnet group $SUBNET_GROUP_NAME"

EXISTING_SUBNET_GROUP=$(aws elasticache describe-cache-subnet-groups \
  --cache-subnet-group-name "$SUBNET_GROUP_NAME" \
  --region "$REGION" \
  --query 'CacheSubnetGroups[0].CacheSubnetGroupName' \
  --output text 2>/dev/null || echo "None")

if [[ "$EXISTING_SUBNET_GROUP" == "None" || -z "$EXISTING_SUBNET_GROUP" ]]; then
  aws elasticache create-cache-subnet-group \
    --cache-subnet-group-name "$SUBNET_GROUP_NAME" \
    --cache-subnet-group-description "Mediczy ElastiCache subnet group (private subnets)" \
    --subnet-ids "$SUBNET_1" "$SUBNET_2" \
    --region "$REGION" >/dev/null
  ok "Subnet group created: $SUBNET_GROUP_NAME"
else
  warn "Subnet group already exists: $SUBNET_GROUP_NAME — skipping"
fi

# ---------------------------------------------------------------------------
# 3. Create ElastiCache Redis cluster
# ---------------------------------------------------------------------------
info "Step 3 — Creating ElastiCache Redis cluster $CLUSTER_ID"

EXISTING_CLUSTER=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "$CLUSTER_ID" \
  --region "$REGION" \
  --query 'CacheClusters[0].CacheClusterId' \
  --output text 2>/dev/null || echo "None")

if [[ "$EXISTING_CLUSTER" == "None" || -z "$EXISTING_CLUSTER" ]]; then
  aws elasticache create-cache-cluster \
    --cache-cluster-id "$CLUSTER_ID" \
    --cache-node-type "$NODE_TYPE" \
    --engine "$ENGINE" \
    --engine-version "$ENGINE_VERSION" \
    --num-cache-nodes 1 \
    --cache-subnet-group-name "$SUBNET_GROUP_NAME" \
    --security-group-ids "$EC_SG_ID" \
    --auth-token "$AUTH_TOKEN" \
    --transit-encryption-enabled \
    --tags Key=Project,Value=mediczy Key=Env,Value=prod \
    --region "$REGION" >/dev/null
  ok "ElastiCache cluster creation initiated: $CLUSTER_ID"
else
  warn "Cluster $CLUSTER_ID already exists — skipping creation"
  warn "Auth token saved earlier in this session. Retrieve from SSM if needed."
fi

# ---------------------------------------------------------------------------
# 4. Wait for cluster to become available
# ---------------------------------------------------------------------------
info "Step 4 — Waiting for cluster $CLUSTER_ID to become available"
log "This typically takes 3-6 minutes..."

ELAPSED=0
INTERVAL=30
MAX_WAIT=600   # 10 minutes

while true; do
  CLUSTER_STATUS=$(aws elasticache describe-cache-clusters \
    --cache-cluster-id "$CLUSTER_ID" \
    --region "$REGION" \
    --query 'CacheClusters[0].CacheClusterStatus' \
    --output text 2>/dev/null || echo "unknown")

  log "Cluster status: $CLUSTER_STATUS  (${ELAPSED}s elapsed)"

  if [[ "$CLUSTER_STATUS" == "available" ]]; then
    ok "Cluster is available!"
    break
  elif [[ "$CLUSTER_STATUS" == "deleted" || "$CLUSTER_STATUS" == "delete-failed" ]]; then
    die "Cluster is in state: $CLUSTER_STATUS"
  fi

  if (( ELAPSED >= MAX_WAIT )); then
    warn "Timeout waiting for cluster. Last status: $CLUSTER_STATUS"
    warn "Run: aws elasticache describe-cache-clusters --cache-cluster-id $CLUSTER_ID --region $REGION"
    exit 1
  fi

  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))
done

# ---------------------------------------------------------------------------
# 5. Retrieve endpoint and print SSM param update commands
# ---------------------------------------------------------------------------
info "Step 5 — Retrieving Redis endpoint"

REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "$CLUSTER_ID" \
  --show-cache-node-info \
  --region "$REGION" \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)

REDIS_PORT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "$CLUSTER_ID" \
  --show-cache-node-info \
  --region "$REGION" \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Port' \
  --output text)

REDIS_URL="rediss://:${AUTH_TOKEN}@${REDIS_ENDPOINT}:${REDIS_PORT}"

ok "Redis endpoint: $REDIS_ENDPOINT:$REDIS_PORT"

echo ""
echo "============================================================"
echo "  SSM PARAMETER STORE — RUN THESE COMMANDS:"
echo "============================================================"
echo ""
echo "aws ssm put-parameter \\"
echo "  --name '${SSM_PREFIX}/REDIS_HOST' \\"
echo "  --value '${REDIS_ENDPOINT}' \\"
echo "  --type SecureString \\"
echo "  --overwrite \\"
echo "  --region $REGION"
echo ""
echo "aws ssm put-parameter \\"
echo "  --name '${SSM_PREFIX}/REDIS_PORT' \\"
echo "  --value '${REDIS_PORT}' \\"
echo "  --type String \\"
echo "  --overwrite \\"
echo "  --region $REGION"
echo ""
echo "aws ssm put-parameter \\"
echo "  --name '${SSM_PREFIX}/REDIS_PASSWORD' \\"
echo "  --value '${AUTH_TOKEN}' \\"
echo "  --type SecureString \\"
echo "  --overwrite \\"
echo "  --region $REGION"
echo ""
echo "aws ssm put-parameter \\"
echo "  --name '${SSM_PREFIX}/REDIS_URL' \\"
echo "  --value '${REDIS_URL}' \\"
echo "  --type SecureString \\"
echo "  --overwrite \\"
echo "  --region $REGION"
echo ""
echo "============================================================"

# ---------------------------------------------------------------------------
# 6. Print ECS redeploy command
# ---------------------------------------------------------------------------
info "Step 6 — Redeploy ECS services to pick up new SSM parameters"
echo ""
echo "============================================================"
echo "  AFTER UPDATING SSM, REDEPLOY ECS SERVICES:"
echo "============================================================"
echo ""
echo "# Redeploy mediczy-app:"
echo "aws ecs update-service \\"
echo "  --cluster control-plane-cluster \\"
echo "  --service mediczy-app \\"
echo "  --force-new-deployment \\"
echo "  --region $REGION"
echo ""
echo "# Redeploy mediczy-worker:"
echo "aws ecs update-service \\"
echo "  --cluster control-plane-cluster \\"
echo "  --service mediczy-worker \\"
echo "  --force-new-deployment \\"
echo "  --region $REGION"
echo ""
echo "============================================================"
echo ""
echo "SECURITY REMINDER: The AUTH_TOKEN printed above is only"
echo "shown once. Store it in SSM immediately or record it securely."
echo "============================================================"

info "Setup complete"
echo ""
echo "Summary:"
echo "  ElastiCache SG  : $EC_SG_ID"
echo "  Subnet Group    : $SUBNET_GROUP_NAME"
echo "  Cluster ID      : $CLUSTER_ID"
echo "  Endpoint        : $REDIS_ENDPOINT:$REDIS_PORT"
echo "  TLS             : enabled (use rediss:// URL)"
echo ""
