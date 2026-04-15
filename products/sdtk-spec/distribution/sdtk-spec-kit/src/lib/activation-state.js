"use strict";

const fs = require("fs");
const path = require("path");
const { getActivationFile, ensureDir, hardenFilePermissions } = require("./suite-state");

/**
 * Write durable local activation metadata.
 * Does NOT store the plain activation key; stores only activation provenance.
 *
 * @param {object} data - Activation metadata to write
 * @param {string} data.provider - "license" (activation source)
 * @param {string} data.customer_id - Customer identifier
 * @param {string} data.plan - Plan tier (e.g., "pro")
 * @param {string} data.machine_id - Bound machine identifier
 * @param {string} data.decision - "activated" | "already_activated"
 * @returns {{ success: boolean, error?: string }}
 */
function writeActivationState(data) {
  const activationFile = getActivationFile();
  const stateData = {
    schema_version: 1,
    provider: data.provider || "license",
    customer_id: data.customer_id,
    plan: data.plan,
    machine_id: data.machine_id,
    activated_at: new Date().toISOString(),
    decision: data.decision || "activated",
  };

  try {
    ensureDir(path.dirname(activationFile));
    const json = JSON.stringify(stateData, null, 2);
    fs.writeFileSync(activationFile, json, "utf8");

    // Harden permissions so only current user can read/write
    hardenFilePermissions(activationFile);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Read local activation metadata.
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
function readActivationState() {
  const activationFile = getActivationFile();

  if (!fs.existsSync(activationFile)) {
    return { success: true, data: null };
  }

  try {
    const raw = fs.readFileSync(activationFile, "utf8");
    const data = JSON.parse(raw);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  writeActivationState,
  readActivationState,
};
