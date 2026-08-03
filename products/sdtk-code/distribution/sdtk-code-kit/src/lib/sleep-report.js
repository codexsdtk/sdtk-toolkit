"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { computeReadiness, gatherSignals } = require("./ship-readiness");

const REPORT_SCHEMA = "sdtk.sleep-report.v1";
const PLAN_SCHEMA = "sdtk.sleep-plan.v1";
const SCOPE_BLOCKER =
  "Scope not declared — the agent could touch any file; `scope_lock` has nothing to enforce.";
const DRY_RUN_DISCLAIMER =
  "This is a pre-flight projection of the plan — nothing was executed.";

function list(value) {
  return Array.isArray(value) ? [...value] : [];
}

function planScope(plan) {
  return plan && plan.scope && typeof plan.scope === "object" ? plan.scope : {};
}

function readinessComponentNotes(readiness) {
  if (!readiness || !Array.isArray(readiness.components)) {
    return [];
  }
  return readiness.components
    .filter((component) => component && typeof component.note === "string" && component.note.length > 0)
    .map((component) => {
      // BK-340 W1: in a pre-flight dry run there are no changed files yet, so
      // the FILE_SCOPE checker reports "absent" — clarify that this is the
      // expected pre-flight state rather than a contradiction next to a
      // READY_TO_SLEEP verdict.
      if (component.name === "FILE_SCOPE" && component.note === "file-scope verdict: absent") {
        return `${component.name}: ${component.note} (no changed files to evaluate yet — expected in a pre-flight dry run)`;
      }
      return `${component.name}: ${component.note}`;
    });
}

function failingComponentNames(readiness) {
  if (!readiness || !Array.isArray(readiness.components)) {
    return [];
  }
  return readiness.components
    .filter((component) => Number(component.points) < Number(component.max))
    .map((component) => component.name)
    .filter((name) => typeof name === "string" && name.length > 0);
}

function projectSleepReport(plan, signals) {
  const readiness = computeReadiness(signals);
  const blockers = [];
  const notes = [];
  const scope = planScope(plan);
  const orderedSteps = list(plan && plan.ordered_steps);
  const testObligations = list(plan && plan.test_obligations);
  const deployConfirmPoints = list(plan && plan.deploy_confirm_points);

  if (!plan || plan.schema_version !== PLAN_SCHEMA || orderedSteps.length === 0) {
    blockers.push("Invalid sleep plan — expected sdtk.sleep-plan.v1 with at least one ordered step.");
  }

  if (scope.declared !== true) {
    blockers.push(SCOPE_BLOCKER);
  }

  if (readiness.verdict === "FAIL") {
    const failing = failingComponentNames(readiness);
    blockers.push(
      failing.length > 0
        ? `Ship-readiness FAIL. Failing components: ${failing.join(", ")}.`
        : "Ship-readiness FAIL."
    );
  }

  if (readiness.verdict === "ENV_BLOCKED") {
    blockers.push("Readiness signals unavailable (ENV_BLOCKED).");
  }

  if (testObligations.length === 0) {
    notes.push("No test obligations carried — `test_evidence_required` has nothing to check.");
  }

  if (readiness.verdict === "PASS_WITH_NOTES") {
    const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];
    if (warnings.length > 0) {
      notes.push(...warnings);
    } else {
      notes.push("Ship-readiness PASS_WITH_NOTES.");
    }
  }

  const verdict = blockers.length > 0
    ? "NOT_READY"
    : notes.length > 0
      ? "READY_WITH_NOTES"
      : "READY_TO_SLEEP";

  const reason = blockers.length > 0
    ? blockers[0]
    : notes.length > 0
      ? notes[0]
      : "The sleep plan is bounded, readiness is PASS, and test obligations are present.";

  return {
    schema_version: REPORT_SCHEMA,
    feature_key: plan && plan.feature_key,
    verdict,
    reason,
    readiness,
    sections: {
      can_i_sleep: { verdict, reason },
      what_it_can_touch: {
        declared: scope.declared === true,
        allowed_file_scopes: list(scope.allowed_file_scopes),
        blocked_file_scopes: list(scope.blocked_file_scopes),
        warning: scope.declared === true ? null : "scope_lock cannot enforce undeclared scope.",
      },
      when_it_will_stop: {
        stop_conditions: list(plan && plan.stop_conditions).map((condition) => {
          if (condition && typeof condition === "object" && typeof condition.id === "string") {
            return condition.id;
          }
          return condition;
        }),
        budgets: plan && plan.budgets && typeof plan.budgets === "object" ? { ...plan.budgets } : {},
      },
      what_proves_done: {
        test_obligations: testObligations,
        readiness_components: readinessComponentNotes(readiness),
      },
      what_needs_you: {
        deploy_confirm_points: deployConfirmPoints,
        blockers: [...blockers],
        notes: [...notes],
      },
    },
    blockers,
    notes,
    dry_run: true,
    generated_at: new Date().toISOString(),
  };
}

function bulletList(items, fallback) {
  if (!Array.isArray(items) || items.length === 0) {
    return `- ${fallback}`;
  }
  return items.map((item) => `- ${String(item)}`).join("\n");
}

function renderSleepReportMarkdown(report) {
  const touch = report.sections.what_it_can_touch;
  const stop = report.sections.when_it_will_stop;
  const proves = report.sections.what_proves_done;
  const needs = report.sections.what_needs_you;

  return [
    `# Sleep Readiness Report — ${report.feature_key}`,
    "",
    DRY_RUN_DISCLAIMER,
    "",
    "## Can I sleep?",
    "",
    `- Verdict: ${report.verdict}`,
    `- Reason: ${report.reason}`,
    `- Readiness: ${report.readiness.score}/${report.readiness.max} — ${report.readiness.verdict}`,
    "",
    "## What it can touch",
    "",
    `- Scope declared: ${touch.declared ? "yes" : "no"}`,
    "- Allowed file scopes:",
    bulletList(touch.allowed_file_scopes, "none declared"),
    "- Blocked file scopes:",
    bulletList(touch.blocked_file_scopes, "none declared"),
    touch.warning ? `- Warning: ${touch.warning}` : "- Warning: none",
    "",
    "## When it will stop",
    "",
    "- Stop conditions:",
    bulletList(stop.stop_conditions, "none declared"),
    "- Budgets:",
    `- max_actions: ${stop.budgets.max_actions !== undefined ? stop.budgets.max_actions : "not declared"}`,
    `- max_iterations: ${stop.budgets.max_iterations !== undefined ? stop.budgets.max_iterations : "not declared"}`,
    "",
    "## What proves it's done",
    "",
    "- Test obligations:",
    bulletList(proves.test_obligations, "none carried"),
    "- Readiness components:",
    bulletList(proves.readiness_components, "none"),
    "",
    "## What needs you",
    "",
    "- Deploy confirm points:",
    bulletList(needs.deploy_confirm_points, "none declared"),
    "- Blockers:",
    bulletList(needs.blockers, "none"),
    "- Notes:",
    bulletList(needs.notes, "none"),
    "",
  ].join("\n");
}

function loadSleepPlan(projectPath) {
  const resolved = path.resolve(projectPath || ".");
  const planPath = path.join(resolved, ".sdtk", "trust", "sleep-plan.json");
  try {
    return JSON.parse(fs.readFileSync(planPath, "utf8"));
  } catch (_error) {
    throw new ValidationError(
      `NEEDS_PLAN: no sleep plan found at ${planPath}; ` +
        "run `sdtk-code sleep plan --feature-key <KEY>` first."
    );
  }
}

function gatherReportSignals(projectPath, featureKey) {
  return gatherSignals(projectPath, featureKey);
}

function writeSleepReport(projectPath, featureKey, markdown) {
  const resolved = path.resolve(projectPath || ".");
  const outDir = path.join(resolved, "docs", "trust");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `SLEEP_REPORT_${featureKey}.md`);
  fs.writeFileSync(outPath, markdown, "utf8");
  return outPath;
}

module.exports = {
  projectSleepReport,
  renderSleepReportMarkdown,
  loadSleepPlan,
  gatherReportSignals,
  writeSleepReport,
};
