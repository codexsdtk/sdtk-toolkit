"use strict";

// Shared deterministic relevance scorer (BK-318).
//
// One implementation used by BOTH surfaces that rank content against a query:
//   - `sdtk-wiki search` / `query` (lib/wiki-search.js) over markdown files
//   - `sdtk-wiki ask` source selection (lib/wiki-ask.js) over atlas index docs
// Extracted from wiki-search.js so the two can never drift apart.
// Exact-phrase + token-overlap scoring; no LLM, no network, fully offline.

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function tokenize(query) {
  return normalizeText(query)
    .split(/[^a-z0-9À-ỹ_]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function scoreFile({ text, title, relativePath, query, tokens }) {
  const lowerText = normalizeText(text);
  const lowerTitle = normalizeText(title);
  const lowerPath = normalizeText(relativePath);
  const phrase = normalizeText(query);
  const reasons = [];
  let score = 0;

  if (phrase && lowerText.includes(phrase)) {
    score += 50;
    reasons.push("exact phrase match in page content");
  }
  if (phrase && lowerTitle.includes(phrase)) {
    score += 30;
    reasons.push("exact phrase match in title");
  }
  if (phrase && lowerPath.includes(phrase)) {
    score += 20;
    reasons.push("exact phrase match in path");
  }

  let matchedTokens = 0;
  for (const token of tokens) {
    const inText = lowerText.includes(token);
    const inTitle = lowerTitle.includes(token);
    const inPath = lowerPath.includes(token);
    if (inText || inTitle || inPath) {
      matchedTokens += 1;
      score += inTitle ? 12 : inPath ? 8 : 5;
    }
  }
  if (matchedTokens > 0) {
    reasons.push(`matched ${matchedTokens}/${tokens.length} query token(s)`);
  }

  return { score, reasons };
}

module.exports = {
  normalizeText,
  tokenize,
  scoreFile,
};
