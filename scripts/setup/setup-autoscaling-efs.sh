#!/bin/bash
# =============================================================================
# setup-autoscaling-efs.sh
# Combined: ECS Application Auto-Scaling + EFS filesystem for transformers cache
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------
REGION="ap-south-1"
CLUSTER_NAME="control-plane-cluster"
APP_SERVICE="mediczy-app"
WORKER_SERVICE="mediczy-worker"
ECS_SG="sg-0a2a2a3e0300e84fe"
SUBNET_1="subnet-0bd5e4eddec91fc71"
SUBNET_2="subnet-03ca64b071a664466"
EFS_NAME="mediczy-transformers-cache"
EFS_CREATION_TOKEN="mediczy-transformers-cache-$(date +%Y%m%d)"

# Auto-scaling bounds
APP_MIN=1
APP_MAX=3
WORKER_MIN=1
WORKER_MAX=2

# Target CPU utilisation % to trigger scale-out
CPU_TARGET=60.0
SCALE_OUT_COOLDOWN=60    # seconds — fast scale-out for latency-sensitive app
SCALE_IN_COOLDOWN=300    # seconds — slow scale-in to avoid flapping

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

# =============================================================================
# SECTION A — ECS APPLICATION AUTO-SCALING
# =============================================================================

info "[AUTO-SCALING] Registering scalable targets and policies"

register_scaling() {
  local SERVICE="$1"
  local MIN="$2"
  local MAX="$3"
  local RESOURCE="service/${CLUSTER_NAME}/${SERVICE}"

  log "Registering scalable target for $SERVICE (min=$MIN, max=$MAX)"

  aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "$RESOURCE" \
    --min-capacity "$MIN" \
    --max-capacity "$MAX" \
    --region "$REGION" >/dev/null

  ok "Scalable target registered: $SERVICE"

  # Build target tracking policy JSON — CPU-based
  local POLICY_NAME="${SERVICE}-cpu-target-tracking"
  local POLICY_JSON
  POLICY_JSON=$(cat <<EOF
{
  "TargetValue": ${CPU_TARGET},
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleOutCooldown": ${SCALE_OUT_COOLDOWN},
  "ScaleInCooldown": ${SCALE_IN_COOLDOWN},
  "DisableScaleIn": false
}
EOF
)

  log "Creating target tracking policy: $POLICY_NAME"
  aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "$RESOURCE" \
    --policy-name "$POLICY_NAME" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration "$POLICY_JSON" \
    --region "$REGION" >/dev/null

  ok "Target tracking policy created: $POLICY_NAME (CPU target: ${CPU_TARGET}%)"
}

# Register both services
register_scaling "$APP_SERVICE"    "$APP_MIN"    "$APP_MAX"
register_scaling "$WORKER_SERVICE" "$WORKER_MIN" "$WORKER_MAX"

info "[AUTO-SCALING] Verifying registered policies"
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --region "$REGION" \
  --query "ScalingPolicies[?ResourceId.contains(@,'$CLUSTER_NAME')].[ResourceId,PolicyName,PolicyType]" \
  --output table

ok "Auto-scaling configuration complete"

# =============================================================================
# SECTION B — EFS FILE SYSTEM FOR TRANSFORMERS CACHE
# =============================================================================

info "[EFS] Creating EFS filesystem: $EFS_NAME"

# Resolve VPC ID from subnet
VPC_ID=$(aws ec2 describe-subnets \
  --subnet-ids "$SUBNET_1" \
  --region "$REGION" \
  --query 'Subnets[0].VpcId' \
  --output text)
log "VPC: $VPC_ID"

# -----------------------------------------------------------------------
# Create EFS security group — allows NFS (2049) from ECS SG only
# -----------------------------------------------------------------------
info "[EFS] Creating EFS security group"
EFS_SG_NAME="mediczy-efs-sg"

EXISTING_EFS_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$EFS_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --region "$REGION" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || echo "None")

if [[ "$EXISTING_EFS_SG" == "None" || -z "$EXISTING_EFS_SG" ]]; then
  EFS_SG_ID=$(aws ec2 create-security-group \
    --group-name "$EFS_SG_NAME" \
    --description "EFS NFS access from ECS tasks only" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query 'GroupId' \
    --output text)
  ok "EFS SG created: $EFS_SG_ID"

  # Allow NFS inbound from ECS SG
  aws ec2 authorize-security-group-ingress \
    --group-id "$EFS_SG_ID" \
    --protocol tcp \
    --port 2049 \
    --source-group "$ECS_SG" \
    --region "$REGION" >/dev/null
  ok "Inbound rule: TCP 2049 (NFS) from ECS SG $ECS_SG"

  aws ec2 create-tags \
    --resources "$EFS_SG_ID" \
    --tags Key=Name,Value="$EFS_SG_NAME" Key=Project,Value=mediczy \
    --region "$REGION"
else
  EFS_SG_ID="$EXISTING_EFS_SG"
  warn "EFS SG already exists: $EFS_SG_ID — skipping"
fi

# -----------------------------------------------------------------------
# Create EFS filesystem
# -----------------------------------------------------------------------
info "[EFS] Creating filesystem"

EXISTING_EFS=$(aws efs describe-file-systems \
  --region "$REGION" \
  --query "FileSystems[?Name=='$EFS_NAME'].FileSystemId | [0]" \
  --output text 2>/dev/null || echo "None")

if [[ "$EXISTING_EFS" == "None" || -z "$EXISTING_EFS" ]]; then
  EFS_ID=$(aws efs create-file-system \
    --creation-token "$EFS_CREATION_TOKEN" \
    --performance-mode generalPurpose \
    --throughput-mode bursting \
    --encrypted \
    --tags Key=Name,Value="$EFS_NAME" Key=Project,Value=mediczy Key=Env,Value=prod \
    --region "$REGION" \
    --query 'FileSystemId' \
    --output text)
  ok "EFS filesystem created: $EFS_ID"

  # Wait for filesystem to become available
  log "Waiting for EFS to become available..."
  ELAPSED=0
  INTERVAL=10
  while true; do
    EFS_STATE=$(aws efs describe-file-systems \
      --file-system-id "$EFS_ID" \
      --region "$REGION" \
      --query 'FileSystems[0].LifeCycleState' \
      --output text)
    log "EFS state: $EFS_STATE  (${ELAPSED}s elapsed)"
    [[ "$EFS_STATE" == "available" ]] && break
    sleep "$INTERVAL"
    ELAPSED=$(( ELAPSED + INTERVAL ))
    (( ELAPSED >= 120 )) && die "EFS filesystem did not become available in 2 minutes"
  done
  ok "EFS filesystem available: $EFS_ID"
else
  EFS_ID="$EXISTING_EFS"
  warn "EFS filesystem already exists: $EFS_ID — skipping creation"
fi

# -----------------------------------------------------------------------
# Create mount targets in both subnets
# -----------------------------------------------------------------------
info "[EFS] Creating mount targets in both subnets"

for SUBNET in "$SUBNET_1" "$SUBNET_2"; do
  EXISTING_MT=$(aws efs describe-mount-targets \
    --file-system-id "$EFS_ID" \
    --region "$REGION" \
    --query "MountTargets[?SubnetId=='$SUBNET'].MountTargetId | [0]" \
    --output text 2>/dev/null || echo "None")

  if [[ "$EXISTING_MT" == "None" || -z "$EXISTING_MT" ]]; then
    MT_ID=$(aws efs create-mount-target \
      --file-system-id "$EFS_ID" \
      --subnet-id "$SUBNET" \
      --security-groups "$EFS_SG_ID" \
      --region "$REGION" \
      --query 'MountTargetId' \
      --output text)
    ok "Mount target created: $MT_ID (subnet: $SUBNET)"
  else
    warn "Mount target already exists in $SUBNET: $EXISTING_MT — skipping"
  fi
done

# -----------------------------------------------------------------------
# Print task definition update instructions
# -----------------------------------------------------------------------
info "[EFS] Configuration complete"
echo ""
echo "============================================================"
echo "  EFS FILESYSTEM ID:"
echo ""
echo "    $EFS_ID"
echo ""
echo "  USE THIS IN:"
echo "    ecs/app-task-def-healthcheck.json"
echo "    ecs/sib-task-def.json"
echo ""
echo "  Replace 'REPLACE_WITH_EFS_ID' with: $EFS_ID"
echo ""
echo "  Then update both task definitions:"
echo ""
echo "  aws ecs register-task-definition \\"
echo "    --cli-input-json file://ecs/app-task-def-full.json \\"
echo "    --region $REGION"
echo ""
echo "  aws ecs update-service \\"
echo "    --cluster $CLUSTER_NAME \\"
echo "    --service $APP_SERVICE \\"
echo "    --task-definition mediczy-app:<new-rev> \\"
echo "    --force-new-deployment \\"
echo "    --region $REGION"
echo "============================================================"
echo ""

info "All done"
echo ""
echo "Summary:"
echo "  mediczy-app  auto-scaling : min=$APP_MIN, max=$APP_MAX, CPU target=${CPU_TARGET}%"
echo "  mediczy-worker auto-scaling: min=$WORKER_MIN, max=$WORKER_MAX, CPU target=${CPU_TARGET}%"
echo "  EFS Filesystem ID         : $EFS_ID"
echo "  EFS Security Group        : $EFS_SG_ID"
echo ""
