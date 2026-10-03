/**
 * Minimal vLLM (OpenAI-compatible) smoke test for Blackwell/Gemma.
 *
 * Usage:
 *   node scripts/test-vllm-blackwell.js
 *
 * Optional:
 *   REMOTE_BLACKWELL_URL=http://129.10.224.226:8000/v1/chat/completions \
 *   REMOTE_BLACKWELL_MODEL=google/gemma-3-12b-it \
 *   node scripts/test-vllm-blackwell.js --prompt "Say hi"
 *
 * Flags:
 *   --url <url>        Override endpoint (default: env REMOTE_BLACKWELL_URL)
 *   --model <id>       Override model (default: env REMOTE_BLACKWELL_MODEL)
 *   --prompt <text>    Prompt to send
 *   --timeout <ms>     Request timeout (default: 60000)
 *   --models           Query /v1/models instead of chat completion
 */
/* eslint-disable no-console */
const dotenv = require('dotenv');
const { performance } = require('node:perf_hooks');
const { URL } = require('node:url');

// Load env in a forgiving order (local dev first, then prod-style)
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function abortableFetch(url, init, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}

function deriveModelsUrl(chatCompletionsUrl) {
  const u = new URL(chatCompletionsUrl);
  // Typical OpenAI-compatible base is /v1/*
  u.pathname = '/v1/models';
  u.search = '';
  u.hash = '';
  return u.toString();
}

async function main() {
  const defaultUrl = 'http://129.10.224.226:8000/v1/chat/completions';
  const url = getArg('--url') || process.env.REMOTE_BLACKWELL_URL || defaultUrl;
  const model = getArg('--model') || process.env.REMOTE_BLACKWELL_MODEL || 'google/gemma-3-12b-it';
  const prompt = getArg('--prompt') || 'Reply with exactly: OK';
  const timeoutMs = Number(getArg('--timeout') || '60000');

  if (!url.startsWith('http')) {
    console.error(`REMOTE_BLACKWELL_URL looks invalid: "${url}"`);
    process.exit(2);
  }

  if (hasFlag('--models')) {
    const modelsUrl = deriveModelsUrl(url);
    console.log(`GET ${modelsUrl}`);
    const t0 = performance.now();
    const res = await abortableFetch(modelsUrl, { method: 'GET' }, timeoutMs);
    const text = await res.text();
    const ms = Math.round(performance.now() - t0);
    console.log(`status=${res.status} time=${ms}ms`);
    console.log(text);
    process.exit(res.ok ? 0 : 1);
  }

  console.log(`POST ${url}`);
  console.log(`model=${model}`);

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 256,
    stream: false,
  };

  const t0 = performance.now();
  const res = await abortableFetch(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  const ms = Math.round(performance.now() - t0);

  const raw = await res.text();
  console.log(`status=${res.status} time=${ms}ms bytes=${raw.length}`);

  if (!res.ok) {
    console.log(raw);
    process.exit(1);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON response.');
    console.log(raw);
    process.exit(1);
  }

  const content = json?.choices?.[0]?.message?.content ?? '';
  console.log('\n--- assistant ---\n');
  console.log(content);
}

main().catch((err) => {
  console.error(`Error: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});

