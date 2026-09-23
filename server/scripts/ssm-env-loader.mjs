/**
 * SSM Parameter Store → process.env loader
 *
 * Fetches all parameters under /mediczy/prod/ from AWS SSM and injects
 * them into process.env before starting the main app. Works on both EC2
 * (where .env is also present as a fallback) and ECS Fargate (no .env).
 *
 * Usage: node scripts/ssm-env-loader.mjs [entrypoint]
 *   entrypoint defaults to "index.js"
 *
 * The script is a passthrough — it loads env then imports the real app,
 * so PM2 / ECS still see one process with the correct PID.
 */

import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const REGION       = process.env.AWS_REGION        || 'ap-south-1';
const SSM_PATH     = process.env.SSM_PARAM_PATH    || '/mediczy/prod';
const SKIP_SSM     = process.env.SKIP_SSM_LOADER   === 'true';
// WP-0.1: once the parameter store is the only source of secrets in production, a failed fetch must
// stop the process rather than silently falling back to whatever local env (or nothing) happens to be
// present — a silent fallback is exactly how a stale or missing secret goes unnoticed. Opt-in only;
// existing behavior (fall back and warn) is unchanged until this is explicitly turned on.
const SSM_REQUIRED = process.env.SSM_REQUIRED      === 'true';

function applyProductionSafeFallbacks({ ssmLoaded }) {
  if (process.env.NODE_ENV !== 'production') return;

  const applied = [];

  if (!process.env.PORT || Number.isNaN(Number(process.env.PORT))) {
    process.env.PORT = '8888';
    applied.push('PORT=8888');
  }

  if (!process.env.POSTGRES_SSL) {
    process.env.POSTGRES_SSL = 'true';
    applied.push('POSTGRES_SSL=true');
  }

  if (!process.env.POSTGRES_PRIMARY_HOST && process.env.POSTGRES_HOST) {
    process.env.POSTGRES_PRIMARY_HOST = process.env.POSTGRES_HOST;
    applied.push('POSTGRES_PRIMARY_HOST<-POSTGRES_HOST');
  }
  if (!process.env.POSTGRES_PRIMARY_PORT && process.env.POSTGRES_PORT) {
    process.env.POSTGRES_PRIMARY_PORT = process.env.POSTGRES_PORT;
    applied.push('POSTGRES_PRIMARY_PORT<-POSTGRES_PORT');
  }
  if (!process.env.POSTGRES_PRIMARY_DATABASE && process.env.POSTGRES_DATABASE) {
    process.env.POSTGRES_PRIMARY_DATABASE = process.env.POSTGRES_DATABASE;
    applied.push('POSTGRES_PRIMARY_DATABASE<-POSTGRES_DATABASE');
  }
  if (!process.env.POSTGRES_PRIMARY_USER && process.env.POSTGRES_USER) {
    process.env.POSTGRES_PRIMARY_USER = process.env.POSTGRES_USER;
    applied.push('POSTGRES_PRIMARY_USER<-POSTGRES_USER');
  }
  if (!process.env.POSTGRES_PRIMARY_PASSWORD && process.env.POSTGRES_PASSWORD) {
    process.env.POSTGRES_PRIMARY_PASSWORD = process.env.POSTGRES_PASSWORD;
    applied.push('POSTGRES_PRIMARY_PASSWORD<-POSTGRES_PASSWORD');
  }

  if (applied.length > 0) {
    const mode = ssmLoaded ? 'post-SSM normalization' : 'SSM fallback hardening';
    console.warn(`[ssm-loader] Applied ${mode}: ${applied.join(', ')}`);
  }
}

async function loadFromSSM() {
  if (SKIP_SSM) return false;

  const client = new SSMClient({ region: REGION });
  let nextToken;

  try {
    do {
      const cmd = new GetParametersByPathCommand({
        Path:           SSM_PATH,
        Recursive:      true,
        WithDecryption: true,
        NextToken:      nextToken,
      });
      const res = await client.send(cmd);
      for (const param of res.Parameters || []) {
        const key = param.Name.replace(`${SSM_PATH}/`, '');
        // In production, SSM is the source of truth. This prevents stale PM2/env
        // values from masking rotated secrets such as OPENAI_API_KEY.
        if (process.env.NODE_ENV === 'production' || !(key in process.env)) {
          process.env[key] = param.Value;
        }
      }
      nextToken = res.NextToken;
    } while (nextToken);

    console.log(`[ssm-loader] Loaded parameters from ${SSM_PATH}`);
    return true;
  } catch (err) {
    if (SSM_REQUIRED) {
      console.error(`[ssm-loader] SSM load failed and SSM_REQUIRED=true — refusing to start: ${err.message}`);
      process.exit(1);
    }
    // Non-fatal: fall back to whatever env is already set (e.g. .env file on EC2)
    console.warn(`[ssm-loader] SSM load failed (falling back to local env): ${err.message}`);
    return false;
  }
}

const ssmLoaded = await loadFromSSM();
applyProductionSafeFallbacks({ ssmLoaded });

// Dynamically import the real entrypoint
const entrypoint = process.argv[2] || 'index.js';
const entryUrl   = pathToFileURL(path.resolve(process.cwd(), entrypoint)).href;
await import(entryUrl);
