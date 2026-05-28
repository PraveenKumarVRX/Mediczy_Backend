#!/bin/bash
# rollback-prod.sh — Roll ECS prod back to a previously pushed ECR image tag
# Usage: ./scripts/rollback-prod.sh v1.0.9

set -euo pipefail

ECR_REGISTRY="480664947830.dkr.ecr.ap-south-1.amazonaws.com"
ECR_REPO="mediczy-app"
ECS_CLUSTER="control-plane-cluster"
ECS_SERVICES=("mediczy-app" "mediczy-worker")
AWS_REGION="ap-south-1"
HEALTH_URL="https://mediczy.in/api/health"

TARGET_VERSION="${1:-}"

if [ -z "$TARGET_VERSION" ]; then
  echo "Usage: ./scripts/rollback-prod.sh <version-tag>"
  echo ""
  echo "Available ECR tags:"
  aws ecr describe-images \
    --repository-name "$ECR_REPO" \
    --region "$AWS_REGION" \
    --query 'imageDetails[*].imageTags[]' \
    --output text | tr '\t' '\n' | sort -V
  exit 1
fi

echo "============================================================"
echo "  Mediczy Prod ROLLBACK → $TARGET_VERSION"
echo "============================================================"
echo ""
read -r -p "  Roll back mediczy.in to $TARGET_VERSION? [yes/N] " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# Re-tag old version as latest and push
echo ""
echo "[1/3] Re-tagging $TARGET_VERSION as latest in ECR..."

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker pull "$ECR_REGISTRY/$ECR_REPO:$TARGET_VERSION"
docker tag  "$ECR_REGISTRY/$ECR_REPO:$TARGET_VERSION" "$ECR_REGISTRY/$ECR_REPO:latest"
docker push "$ECR_REGISTRY/$ECR_REPO:latest"

# Force ECS to pull latest (which is now the rollback version)
echo ""
echo "[2/3] Triggering ECS rollback deployment..."

for SERVICE in "${ECS_SERVICES[@]}"; do
  aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service  "$SERVICE" \
    --force-new-deployment \
    --region   "$AWS_REGION" \
    --query    'service.{service:serviceName,desired:desiredCount}' \
    --output   table
done

echo ""
echo "[3/3] Waiting for stability..."
aws ecs wait services-stable \
  --cluster  "$ECS_CLUSTER" \
  --services "mediczy-app" \
  --region   "$AWS_REGION" && echo "  Service stable." \
  || echo "  WARN: wait timed out — check ECS console."

sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
echo ""
echo "  Health check: HTTP $HTTP_STATUS"

echo ""
echo "============================================================"
echo "  ROLLBACK COMPLETE → $TARGET_VERSION"
echo "  URL: https://mediczy.in"
echo "============================================================"
