#!/usr/bin/env bash
# Deploy NestJS control-plane service to ECS.
# If service exists, this script updates it with a new task definition revision.
# If service does not exist, it registers a task definition and prints create-service command.

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
ECS_CLUSTER="${ECS_CLUSTER:-control-plane-cluster}"
ECS_SERVICE="${ECS_SERVICE:-mediczy-control-plane}"
TASK_FAMILY="${TASK_FAMILY:-mediczy-control-plane}"
CONTAINER_NAME="${CONTAINER_NAME:-mediczy-control-plane}"
ECR_REPO="${ECR_REPO:-mediczy-control-plane}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
TEMPLATE_PATH="${TEMPLATE_PATH:-ecs/nestjs-control-plane-task-def.json}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.nestjs-control-plane}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for cmd in aws docker jq; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $cmd"
    exit 1
  }
done

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$AWS_REGION")"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_URI="${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

if ! aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "ECR repo $ECR_REPO does not exist. Creating it..."
  aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" >/dev/null
fi

echo "Building image: $IMAGE_URI"
docker build -f "$DOCKERFILE" -t "$IMAGE_URI" .

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
docker push "$IMAGE_URI"

SERVICE_STATUS="$(aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION" \
  --query 'services[0].status' \
  --output text 2>/dev/null || echo MISSING)"

if [[ "$SERVICE_STATUS" != "ACTIVE" ]]; then
  echo "Service $ECS_SERVICE not found in cluster $ECS_CLUSTER."
  echo "Registering first task definition from template: $TEMPLATE_PATH"

  if [[ ! -f "$TEMPLATE_PATH" ]]; then
    echo "ERROR: template missing at $TEMPLATE_PATH"
    exit 1
  fi

  RENDERED_TD="/tmp/${TASK_FAMILY}-task-def.json"
  jq \
    --arg image "$IMAGE_URI" \
    '.containerDefinitions |= map(if .name == "mediczy-control-plane" then .image = $image else . end)' \
    "$TEMPLATE_PATH" > "$RENDERED_TD"

  NEW_TD_ARN="$(aws ecs register-task-definition \
    --cli-input-json "file://${RENDERED_TD}" \
    --region "$AWS_REGION" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)"

  echo "Registered task definition: $NEW_TD_ARN"
  echo ""
  echo "Create service command (review subnets/security-groups before running):"
  echo "aws ecs create-service \\
  --cluster ${ECS_CLUSTER} \\
  --service-name ${ECS_SERVICE} \\
  --task-definition ${NEW_TD_ARN} \\
  --desired-count 1 \\
  --launch-type FARGATE \\
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-aaa,subnet-bbb],securityGroups=[sg-xxx],assignPublicIp=DISABLED}' \\
  --region ${AWS_REGION}"
  exit 0
fi

echo "Service $ECS_SERVICE exists. Updating service with new image."
CURRENT_TD_ARN="$(aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION" \
  --query 'services[0].taskDefinition' \
  --output text)"

CURRENT_TD_JSON="/tmp/${TASK_FAMILY}-current.json"
UPDATED_TD_JSON="/tmp/${TASK_FAMILY}-updated.json"

aws ecs describe-task-definition --task-definition "$CURRENT_TD_ARN" --region "$AWS_REGION" > "$CURRENT_TD_JSON"

jq \
  --arg container "$CONTAINER_NAME" \
  --arg image "$IMAGE_URI" \
  '.taskDefinition as $td |
  {
    family: $td.family,
    taskRoleArn: $td.taskRoleArn,
    executionRoleArn: $td.executionRoleArn,
    networkMode: $td.networkMode,
    requiresCompatibilities: $td.requiresCompatibilities,
    cpu: $td.cpu,
    memory: $td.memory,
    runtimePlatform: $td.runtimePlatform,
    volumes: ($td.volumes // []),
    containerDefinitions: (
      ($td.containerDefinitions // [])
      | map(
          if .name == $container then
            .image = $image
            | .healthCheck = {
              command: ["CMD-SHELL", "wget -q -O - http://localhost:3000/cp/live >/dev/null || exit 1"],
                interval: 30,
                timeout: 5,
                retries: 3,
                startPeriod: 45
              }
          else . end
        )
    )
  }
  | with_entries(select(.value != null))' \
  "$CURRENT_TD_JSON" > "$UPDATED_TD_JSON"

NEW_TD_ARN="$(aws ecs register-task-definition \
  --cli-input-json "file://${UPDATED_TD_JSON}" \
  --region "$AWS_REGION" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)"

echo "Registered task definition: $NEW_TD_ARN"

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$NEW_TD_ARN" \
  --force-new-deployment \
  --region "$AWS_REGION" \
  --query 'service.{serviceName:serviceName,taskDefinition:taskDefinition,status:status}' \
  --output table

echo "Waiting for service stabilization..."
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" --region "$AWS_REGION"

echo "Deployment completed."
aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION" \
  --query 'services[0].{running:runningCount,desired:desiredCount,taskDefinition:taskDefinition,rollout:deployments[0].rolloutState}' \
  --output table
