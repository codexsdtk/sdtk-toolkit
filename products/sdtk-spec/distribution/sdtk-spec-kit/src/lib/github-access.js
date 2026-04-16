"use strict";

const { ValidationError } = require("./errors");

// Entitlement repo: configurable via env var, falls back to default.
// Set SDTK_ENTITLEMENT_REPO=owner/repo to override.
const DEFAULT_REPO = "DucTN/sdtk-private";

function getEntitlementRepo() {
  return process.env.SDTK_ENTITLEMENT_REPO || DEFAULT_REPO;
}

/**
 * Check if a GitHub token has access to the private distribution repo.
 *
 * @param {string} token - GitHub PAT.
 * @param {string} [repo] - Repo in "owner/name" format. Defaults to SDTK_ENTITLEMENT_REPO env or built-in default.
 * @returns {Promise<{hasAccess: boolean, message: string}>}
 */
async function checkRepoAccess(token, repo) {
  const targetRepo = repo || getEntitlementRepo();
  const url = `https://api.github.com/repos/${targetRepo}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "sdtk-cli",
      },
    });

    if (response.status === 200) {
      return {
        hasAccess: true,
        message: `Access verified for ${targetRepo}.`,
      };
    }

    if (response.status === 404 || response.status === 403) {
      return {
        hasAccess: false,
        message: `No access to ${targetRepo}. Check your token permissions.`,
      };
    }

    if (response.status === 401) {
      return {
        hasAccess: false,
        message: "Token is invalid or expired.",
      };
    }

    return {
      hasAccess: false,
      message: `Unexpected response (HTTP ${response.status}) from GitHub API.`,
    };
  } catch (err) {
    throw new ValidationError(
      `Failed to reach GitHub API: ${err.message}\nCheck your network connection.`
    );
  }
}

/**
 * Fetch a file from the GitHub Contents API and return its decoded bytes.
 *
 * The GitHub Contents API returns the file content base64-encoded (with line breaks).
 * This function strips line breaks and decodes to a Buffer.
 *
 * @param {string} token  - GitHub PAT
 * @param {string} repo   - Repository in "owner/name" format
 * @param {string} filePath - Repo-relative file path
 * @param {string} ref    - Branch, tag, or commit SHA
 * @param {Function} [fetcher] - Injectable fetch function (default: global fetch)
 * @returns {Promise<Buffer>} Decoded file bytes
 * @throws {ValidationError} on HTTP error or missing content field
 */
async function fetchGithubContents(token, repo, filePath, ref, fetcher) {
  const _fetch = fetcher || fetch;
  const encodedRef = encodeURIComponent(ref);
  const url = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${encodedRef}`;

  let response;
  try {
    response = await _fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "sdtk-cli",
      },
    });
  } catch (err) {
    throw new ValidationError(
      `Failed to reach GitHub API: ${err.message}\nCheck your network connection.`
    );
  }

  if (response.status === 401) {
    throw new ValidationError(
      "GitHub token is invalid or expired. Run: sdtk-spec auth --token <value>"
    );
  }
  if (response.status === 403) {
    throw new ValidationError(
      `No access to ${repo}. Check your token permissions.`
    );
  }
  if (response.status === 404) {
    throw new ValidationError(
      `Remote content not found: ${filePath} at ${repo}@${ref}.`
    );
  }
  if (response.status !== 200) {
    throw new ValidationError(
      `Unexpected HTTP ${response.status} from GitHub Contents API.`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (_e) {
    throw new ValidationError(
      "GitHub Contents API response is not valid JSON."
    );
  }

  if (!data || typeof data.content !== "string") {
    throw new ValidationError(
      "GitHub Contents API response missing content field."
    );
  }

  // GitHub encodes file content as base64 with embedded newlines.
  return Buffer.from(data.content.replace(/\n/g, ""), "base64");
}

module.exports = {
  checkRepoAccess,
  fetchGithubContents,
  getEntitlementRepo,
};
