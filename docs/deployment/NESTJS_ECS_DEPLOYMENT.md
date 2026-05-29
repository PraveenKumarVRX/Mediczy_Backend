# NestJS Backend on ECS

This project already includes a NestJS backend in `control-plane/`.

This guide adds ECS deployment support with:
- image build using `Dockerfile.nestjs-control-plane`
- task definition template in `ecs/nestjs-control-plane-task-def.json`
- deployment automation script in `scripts/deploy-nestjs-control-plane-ecs.sh`

## 1) Prerequisites

- AWS CLI configured with permissions for ECR and ECS
- Docker available on the deploy host
- Existing ECS cluster (default: `control-plane-cluster`)

## 2) First-time deployment (service does not exist yet)

Run:

```bash
cd /home/ubuntu/Mediczy
AWS_REGION=ap-south-1 \
ECS_CLUSTER=control-plane-cluster \
ECS_SERVICE=mediczy-control-plane \
ECR_REPO=mediczy-control-plane \
./scripts/deploy-nestjs-control-plane-ecs.sh
```

If the ECS service does not exist, the script will:
1. Build and push the image to ECR
2. Register a task definition from `ecs/nestjs-control-plane-task-def.json`
3. Print an `aws ecs create-service` command for you to run with your subnets/security groups

## 3) Rolling update (service already exists)

Run the same script. It will:
1. Build and push a new tagged image
2. Clone current service task definition
3. Patch the NestJS container image and health check
4. Register new revision and force deploy
5. Wait for ECS service stability

## 4) Health checks

- Liveness endpoint: `GET /live`
- Deep health endpoint: `GET /health` (includes DB check)

ECS health check uses `/live` to avoid restarts caused by transient DB issues.

## 5) Required secrets (SSM)

Task template expects these SSM parameters:
- `/mediczy/prod/POSTGRES_HOST`
- `/mediczy/prod/POSTGRES_PORT`
- `/mediczy/prod/POSTGRES_DATABASE`
- `/mediczy/prod/POSTGRES_USER`
- `/mediczy/prod/POSTGRES_PASSWORD`
- `/mediczy/prod/POSTGRES_SSL`
- `/mediczy/prod/JWT_SECRET`

## 6) Recommended ALB routing

- Route host `api.mediczy.in` or path prefix `/cp/*` to the NestJS target group
- Container port: `3000`
- Health check path: `/live`

## 7) Quick verification

After deployment:

```bash
aws ecs describe-services \
  --cluster control-plane-cluster \
  --services mediczy-control-plane \
  --region ap-south-1 \
  --query 'services[0].{running:runningCount,desired:desiredCount,td:taskDefinition,rollout:deployments[0].rolloutState}'
```

And test from browser or curl:

```bash
curl -sS https://<your-domain>/live
curl -sS https://<your-domain>/health
```
