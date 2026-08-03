"use strict";

const PRIVATE_TAG_PATTERN = /<private>[\s\S]*?<\/private>/gi;

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|SECRET KEY)[-A-Z ]*-----[\s\S]*?-----END [A-Z ]*(?:PRIVATE KEY|SECRET KEY)[-A-Z ]*-----/g,
  /(?:api[_-]?key|secret|token|password|credential|auth)[\s]*[=:]\s*["']?[A-Za-z0-9_\-/.+]{12,}["']?/gi,
  /(?:[A-Z][A-Z0-9_]{2,}(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH))[\s]*=[\s]*["']?[^\s"']{8,}["']?/g,
  /(?:Authorization\s*[:=]\s*)?Bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi,
  /sk-proj-[A-Za-z0-9\-_]{20,}/g,
  /(?:sk|pk|rk|ak)-[A-Za-z0-9][A-Za-z0-9\-_]{19,}/g,
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /gh[pus]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /xoxb-[A-Za-z0-9\-]+/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[A-Za-z0-9\-_]{35}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /npm_[A-Za-z0-9]{36}/g,
  /glpat-[A-Za-z0-9\-_]{20,}/g,
  /dop_v1_[A-Za-z0-9]{64}/g,
  /\b[A-Za-z0-9+/=_-]{48,}\b/g,
];

function secretPatternSources() {
  return SECRET_PATTERNS.map((source) => new RegExp(source.source, source.flags));
}

function containsSecretMaterial(input) {
  if (typeof input !== "string" || input.length === 0) {
    return false;
  }
  if (PRIVATE_TAG_PATTERN.test(input)) {
    PRIVATE_TAG_PATTERN.lastIndex = 0;
    return true;
  }
  PRIVATE_TAG_PATTERN.lastIndex = 0;
  for (const pattern of secretPatternSources()) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

function redact(input) {
  if (typeof input !== "string") {
    return "";
  }

  let result = input.replace(PRIVATE_TAG_PATTERN, "[REDACTED]");
  for (const pattern of secretPatternSources()) {
    result = result.replace(pattern, "[REDACTED_SECRET]");
  }
  return result;
}

module.exports = { redact, SECRET_PATTERNS, containsSecretMaterial };
