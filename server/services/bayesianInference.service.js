import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TIMEOUT_MS = 6000;
const PYTHON_BIN = process.env.BAYESIAN_PYTHON_BIN || process.env.PYTHON_BIN || 'python3';
const SCRIPT_PATH = process.env.BAYESIAN_SCRIPT_PATH
  ? path.resolve(process.env.BAYESIAN_SCRIPT_PATH)
  : path.resolve(__dirname, '..', '..', 'ai-engine', 'doctor_bot', 'utils', 'bayesian_network.py');

if (!fs.existsSync(SCRIPT_PATH)) {
  console.warn(`Bayesian inference script not found at ${SCRIPT_PATH}`);
}

const sanitizeEvidence = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return {};
  return Object.entries(payload).reduce((acc, [key, value]) => {
    if (!value) return acc;
    if (typeof value === 'string') {
      acc[key] = value;
      return acc;
    }
    if (typeof value === 'object' && typeof value.state === 'string') {
      acc[key] = value.state;
    }
    return acc;
  }, {});
};

export const runBayesianInference = (evidence, options = {}) => {
  const sanitized = sanitizeEvidence(evidence);
  const timeoutMs = Number.parseInt(process.env.BAYESIAN_INFERENCE_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`, 10);
  const effectiveTimeout = Number.isNaN(timeoutMs) ? DEFAULT_TIMEOUT_MS : timeoutMs;

  if (!Object.keys(sanitized).length) {
    return Promise.reject(new Error('At least one evidence node is required for inference.'));
  }
  if (!fs.existsSync(SCRIPT_PATH)) {
    return Promise.reject(new Error('Bayesian inference script is unavailable on this host.'));
  }

  return new Promise((resolve, reject) => {
    const args = [SCRIPT_PATH, '--evidence', JSON.stringify(sanitized), '--json-only'];
    const child = spawn(PYTHON_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Bayesian inference timed out.'));
    }, effectiveTimeout);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(`Bayesian script exited with code ${code}: ${stderr || 'No stderr output.'}`);
        return reject(error);
      }
      try {
        const parsed = JSON.parse(stdout || '{}');
        return resolve(parsed);
      } catch (err) {
        const error = new Error(`Failed to parse Bayesian inference output: ${err.message}`);
        return reject(error);
      }
    });
  });
};

export const getBayesianScriptPath = () => SCRIPT_PATH;
