"use strict";

const https = require("https");
const { URL } = require("url");
const { ValidationError } = require("./errors");

const MODEL_MAX_CALLS_PER_RUN = 1;
const MODEL_CALL_TIMEOUT_MS = 120000;
const MODEL_WALLCLOCK_TIMEOUT_MS = 300000;
const MODEL_MAX_OUTPUT_TOKENS = 16000;
const CONTEXT_MAX_FILES = 20;
const CONTEXT_MAX_BYTES = 262144;
const MODEL_EGRESS_ALLOWLIST = Object.freeze(["api.anthropic.com"]);
const MODEL_ID = "claude-sonnet-4-6";
const MODEL_PRICE_INPUT_USD_PER_MTOK = 3.00;
const MODEL_PRICE_OUTPUT_USD_PER_MTOK = 15.00;
const MODEL_PRICING_SOURCE_DATE = "2026-05-26";
const MODEL_MAX_COST_USD = 1.00;
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_PROVIDER = "claude";

const MODEL_PRICING = Object.freeze({
  [MODEL_ID]: Object.freeze({
    input_usd_per_mtok: MODEL_PRICE_INPUT_USD_PER_MTOK,
    output_usd_per_mtok: MODEL_PRICE_OUTPUT_USD_PER_MTOK,
    source_date: MODEL_PRICING_SOURCE_DATE,
  }),
});

function estimateTokensFromText(text) {
  return Math.ceil(Buffer.byteLength(String(text || ""), "utf8") / 4);
}

function projectedCostUsd(modelId, inputTokenEstimate, maxOutputTokens) {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) {
    throw new ValidationError(`FAIL_MODEL_PRICING_UNKNOWN: no pinned pricing for model_id ${modelId}`);
  }
  const inputCost = (Number(inputTokenEstimate || 0) / 1000000) * pricing.input_usd_per_mtok;
  const outputCost = (Number(maxOutputTokens || 0) / 1000000) * pricing.output_usd_per_mtok;
  return Number((inputCost + outputCost).toFixed(6));
}

function assertCostWithinCap(modelId, inputTokenEstimate, maxOutputTokens) {
  const cost = projectedCostUsd(modelId, inputTokenEstimate, maxOutputTokens);
  if (cost > MODEL_MAX_COST_USD) {
    throw new ValidationError(`FAIL_MODEL_COST_CAP: projected model cost ${cost} exceeds cap ${MODEL_MAX_COST_USD}`);
  }
  return cost;
}

function assertAllowedHost(hostname) {
  if (!MODEL_EGRESS_ALLOWLIST.includes(String(hostname || ""))) {
    throw new ValidationError(`FAIL_EGRESS_HOST_NOT_ALLOWED: ${hostname || "(missing host)"}`);
  }
}

function parseEndpoint(endpoint) {
  const url = new URL(endpoint || "https://api.anthropic.com/v1/messages");
  if (url.protocol !== "https:") {
    throw new ValidationError("FAIL_EGRESS_HOST_NOT_ALLOWED: model egress requires https");
  }
  assertAllowedHost(url.hostname);
  return url;
}

function defaultHttpsTransport(options, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers || {},
        body: data,
        connectionHost: options.hostname,
      }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("FAIL_MODEL_TIMEOUT: model call timed out"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function responseText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.patch === "string") return payload.patch;
  if (typeof payload.text === "string") return payload.text;
  if (Array.isArray(payload.content)) {
    return payload.content.map((part) => {
      if (part && typeof part.text === "string") return part.text;
      return "";
    }).join("\n").trim();
  }
  return "";
}

function usageFromPayload(payload) {
  const usage = payload && typeof payload === "object" && payload.usage && typeof payload.usage === "object"
    ? payload.usage : {};
  return {
    input_tokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
    output_tokens: typeof usage.output_tokens === "number" ? usage.output_tokens : null,
  };
}

async function callModelProvider(request, deps) {
  const req = request || {};
  const options = deps || {};
  const modelId = req.model_id || MODEL_ID;
  const provider = req.provider || DEFAULT_PROVIDER;
  const maxOutputTokens = Number(req.max_output_tokens || MODEL_MAX_OUTPUT_TOKENS);
  if (provider !== DEFAULT_PROVIDER) {
    throw new ValidationError(`FAIL_EGRESS_HOST_NOT_ALLOWED: unsupported provider ${provider}`);
  }
  if (modelId !== MODEL_ID) {
    projectedCostUsd(modelId, 0, maxOutputTokens);
  }
  if (maxOutputTokens > MODEL_MAX_OUTPUT_TOKENS) {
    throw new ValidationError(`FAIL_MODEL_OUTPUT_TOKEN_CAP: max_output_tokens ${maxOutputTokens} exceeds ${MODEL_MAX_OUTPUT_TOKENS}`);
  }
  if (Number(req.call_count || 1) > MODEL_MAX_CALLS_PER_RUN) {
    throw new ValidationError("FAIL_MODEL_CALL_LIMIT: only one model call is allowed per run");
  }

  const prompt = String(req.prompt || "");
  const inputTokens = typeof req.input_token_estimate === "number" ? req.input_token_estimate : estimateTokensFromText(prompt);
  const projectedCost = assertCostWithinCap(modelId, inputTokens, maxOutputTokens);

  const env = options.env || process.env;
  const apiKey = options.apiKey || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ValidationError("FAIL_MODEL_CREDENTIAL_MISSING: ANTHROPIC_API_KEY is required for --execute author mode");
  }

  const endpoint = parseEndpoint(req.endpoint || "https://api.anthropic.com/v1/messages");
  const body = JSON.stringify({
    model: modelId,
    max_tokens: maxOutputTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const transport = options.transport || defaultHttpsTransport;
  const transportOptions = {
    protocol: "https:",
    hostname: endpoint.hostname,
    port: endpoint.port || 443,
    method: "POST",
    path: `${endpoint.pathname}${endpoint.search}`,
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
  };

  const response = await transport(transportOptions, body, MODEL_CALL_TIMEOUT_MS);
  assertAllowedHost(response && response.connectionHost ? response.connectionHost : transportOptions.hostname);
  const statusCode = Number(response && response.statusCode || 0);
  if (statusCode >= 300 && statusCode < 400) {
    const location = response.headers && response.headers.location;
    if (location) {
      const redirect = new URL(location, endpoint);
      assertAllowedHost(redirect.hostname);
    }
    throw new ValidationError("FAIL_EGRESS_HOST_NOT_ALLOWED: redirects are not followed in D-2b");
  }
  if (statusCode < 200 || statusCode >= 300) {
    throw new ValidationError(`FAIL_MODEL_PROVIDER_ERROR: provider status ${statusCode}`);
  }

  let payload;
  try {
    payload = JSON.parse(response.body || "{}");
  } catch (_error) {
    throw new ValidationError("FAIL_MODEL_PROVIDER_ERROR: provider returned invalid JSON");
  }
  const patch = responseText(payload);
  const tokensUsed = usageFromPayload(payload);
  if (tokensUsed.output_tokens != null && tokensUsed.output_tokens > MODEL_MAX_OUTPUT_TOKENS) {
    throw new ValidationError(`FAIL_MODEL_OUTPUT_TOKEN_CAP: output tokens ${tokensUsed.output_tokens} exceeds ${MODEL_MAX_OUTPUT_TOKENS}`);
  }
  if (!patch) {
    throw new ValidationError("FAIL_MODEL_PROVIDER_ERROR: provider returned no patch text");
  }
  return {
    provider,
    model_id: modelId,
    patch,
    tokens_used: tokensUsed,
    projected_cost_usd: projectedCost,
    model_call_count: 1,
  };
}

module.exports = {
  MODEL_MAX_CALLS_PER_RUN,
  MODEL_CALL_TIMEOUT_MS,
  MODEL_WALLCLOCK_TIMEOUT_MS,
  MODEL_MAX_OUTPUT_TOKENS,
  CONTEXT_MAX_FILES,
  CONTEXT_MAX_BYTES,
  MODEL_EGRESS_ALLOWLIST,
  MODEL_ID,
  MODEL_PRICE_INPUT_USD_PER_MTOK,
  MODEL_PRICE_OUTPUT_USD_PER_MTOK,
  MODEL_PRICING_SOURCE_DATE,
  MODEL_MAX_COST_USD,
  MODEL_PRICING,
  estimateTokensFromText,
  projectedCostUsd,
  assertCostWithinCap,
  assertAllowedHost,
  callModelProvider,
};
