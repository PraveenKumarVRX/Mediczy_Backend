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

const REGION    = process.env.AWS_REGION        || 'ap-south-1';
const SSM_PATH  = process.env.SSM_PARAM_PATH    || '/mediczy/prod';
const SKIP_SSM  = process.env.SKIP_SSM_LOADER   === 'true';

async function loadFromSSM() {
  if (SKIP_SSM) return;

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
  } catch (err) {
    // Non-fatal: fall back to whatever env is already set (e.g. .env file on EC2)
    console.warn(`[ssm-loader] SSM load failed (falling back to local env): ${err.message}`);
  }
}

await loadFromSSM();

// Dynamically import the real entrypoint
const entrypoint = process.argv[2] || 'index.js';
const entryUrl   = pathToFileURL(path.resolve(process.cwd(), entrypoint)).href;
await import(entryUrl);
