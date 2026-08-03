"use strict";

// `sdtk account` — CLI wrapper over the credential-free account lib (BK-373).
// Read-only by default (`status`); `link`/`link --undo` mutate only the
// session-store symlinks and are explicit subcommands. Meter/utility, not a
// gate: always exits 0.

const os = require("os");
const path = require("path");
const {
  buildStatus,
  planLinkTargets,
  linkAccount,
  unlinkAccount,
} = require("../lib/account");
const { readRegistry } = require("../lib/account-slots");

function basename(p) {
  return path.basename(p);
}

// Slots created by `sdtk login` are linkable even before they hold a session:
// discovery needs a projects/ tree, and a just-logged-in slot has none yet.
function slotSecondaries(deps) {
  const homedir = deps.homedir || os.homedir();
  const reg = readRegistry({ homedir, fsImpl: deps.fsImpl });
  return Object.values(reg.slots || {})
    .filter((s) => s && s.vendor && s.dir)
    .map((s) => ({ vendor: s.vendor, dir: s.dir }));
}

const HELP_TEXT = `sdtk account <status|link|guide>

Credential-free multi-account visibility and shared-session-store setup for
Claude Code and Codex CLI. SDTK never reads, copies, or stores a credential
file — identity comes from the vendor CLI's own \`auth status\`, and link only
ever touches the projects/ (Claude) or sessions/ (Codex) trees.

Subcommands:
  sdtk account status [--json] [--no-identity]
      List every account dir (~/.claude*, ~/.codex*), the active default, the
      session-store link state (isolated vs shared), and per-account headroom
      (last-5h output tokens for Claude; last-known used% / reset for Codex).
      --no-identity skips the per-account vendor-CLI identity lookup (faster).

  sdtk account link [--undo] [--dry-run]
      Link (share) each dash-variant account's session store into its default
      account's store, so either account can --resume any session. Safe-first:
      the secondary's original store is preserved as <top>.bak.<timestamp>;
      nothing is deleted. --undo restores isolated stores from those backups.
      --dry-run prints the plan without touching anything.

  sdtk account guide
      Print the copy-paste setup for adding another account slot.

Exit codes:
  0  always — this is a utility, not a health gate.

Safety: after linking, never --resume the SAME session id on two accounts at
once (two writers, one transcript). Different sessions in parallel are fine.`;

const GUIDE_TEXT = `Add another Claude/Codex account slot (login once, switch by alias):

1) Log the new account into its own config dir (one time):
     CLAUDE_CONFIG_DIR=~/.claude-work claude   # then /login in the session
     CODEX_HOME=~/.codex-work codex login --device-auth   # for Codex

2) Add a switch alias to your shell profile:
     alias claude-work='CLAUDE_CONFIG_DIR=~/.claude-work claude'
     alias codex-work='CODEX_HOME=~/.codex-work codex'

3) Share session history so either account can --resume any conversation:
     sdtk account link

Tokens persist per dir and auto-refresh — you never log in again. Check who is
active and who has quota headroom with:  sdtk account status`;

function parseArgs(args) {
  const opts = { sub: null, json: false, undo: false, dryRun: false, noIdentity: false };
  for (const a of args) {
    if (a === "--help" || a === "-h") return { sub: "help" };
    if (a === "--json") opts.json = true;
    else if (a === "--undo") opts.undo = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--no-identity") opts.noIdentity = true;
    else if (!a.startsWith("-") && !opts.sub) opts.sub = a;
  }
  return opts;
}

function fmtHeadroom(h) {
  if (!h) return "";
  if (h.kind === "shared") return h.note;
  if (h.kind === "tokens") return `5h out ${h.last5hOutput.toLocaleString()} tok (recent activity, not a quota figure)`;
  const reset = h.resetsAt ? new Date(h.resetsAt * 1000).toISOString() : "?";
  return `used ${h.usedPercent}% (resets ${reset})`;
}

function renderStatus(status) {
  const lines = [];
  lines.push(`sdtk account — ${status.accounts.length} account(s)`);
  lines.push("");
  for (const vendor of ["claude", "codex"]) {
    const rows = status.accounts.filter((a) => a.vendor === vendor);
    if (!rows.length) continue;
    lines.push(`[${vendor}]  active default: ${status.active[vendor]}`);
    for (const r of rows) {
      const store = r.sharedWith && r.sharedWith.length ? `shares store w/ ${r.sharedWith.join(",")}` : "isolated store";
      const marks = [r.active ? "ACTIVE" : "", store].filter(Boolean).join(", ");
      lines.push(`  ${r.label.padEnd(14)} ${marks}`);
      if (r.identity !== undefined) lines.push(`      identity: ${r.identity || "unknown"}`);
      const hr = fmtHeadroom(r.headroom);
      if (hr) lines.push(`      headroom: ${hr}`);
      for (const ev of (r.limits || []).slice(0, 3)) {
        // Date included on purpose: an event can be months old and still be the
        // newest of its kind, and "you hit your weekly limit" reads as current
        // unless the date is right next to it.
        const when = ev.at ? new Date(ev.at).toISOString().slice(0, 16).replace("T", " ") : "unknown date";
        lines.push(`      limit hit: ${ev.kind} · ${when} UTC`);
      }
    }
    lines.push("");
  }
  const shareGroups = Object.values(status.storeGroups).filter((g) => g.length > 1);
  if (shareGroups.length) {
    for (const g of shareGroups) lines.push(`shared session store: ${g.join(" ↔ ")} (cross-account --resume works)`);
  } else {
    lines.push("no shared session store — run `sdtk account link` to enable cross-account --resume");
  }
  if (status.accounts.some((a) => (a.limits || []).length)) {
    lines.push("");
    lines.push("`limit hit` is the last time that wall was actually reached, not remaining quota.");
    lines.push("Claude publishes no local headroom figure; reading it would require your token.");
  }
  if (status.skippedSiblings.length) {
    const names = status.skippedSiblings.map((s) => s.name).join(", ");
    lines.push(`${status.skippedSiblings.length} dot-suffix sibling dir(s) skipped: ${names}`);
  }
  return lines.join("\n");
}

function cmdAccount(args, deps = {}) {
  const opts = parseArgs(args);
  const out = deps.log || console.log;

  if (opts.sub === "help" || opts.sub === null) {
    out(HELP_TEXT);
    return 0;
  }

  if (opts.sub === "guide") {
    out(GUIDE_TEXT);
    return 0;
  }

  if (opts.sub === "status") {
    const status = buildStatus({ ...deps, withIdentity: !opts.noIdentity, extraDirs: slotSecondaries(deps) });
    out(opts.json ? JSON.stringify(status, null, 2) : renderStatus(status));
    return 0;
  }

  if (opts.sub === "link") {
    const plan = planLinkTargets({ ...deps, extraSecondaryDirs: slotSecondaries(deps) });
    if (!plan.length) {
      out("No linkable accounts: need a default dir (.claude/.codex) plus at least one dash-variant (.claude-<name>).");
      return 0;
    }
    if (opts.dryRun) {
      out(`Plan (${opts.undo ? "undo" : "link"}):`);
      for (const p of plan) {
        out(opts.undo
          ? `  restore isolated store for ${p.secondaryLabel} (${p.vendor})`
          : `  share ${p.secondaryLabel} → ${path.basename(p.primaryDir)} store (${p.vendor})`);
      }
      out("(dry-run — nothing changed)");
      return 0;
    }
    const results = plan.map((p) =>
      opts.undo
        ? unlinkAccount({ secondaryDir: p.secondaryDir, vendor: p.vendor, fsImpl: deps.fsImpl })
        : linkAccount({ primaryDir: p.primaryDir, secondaryDir: p.secondaryDir, vendor: p.vendor, fsImpl: deps.fsImpl })
    );
    for (const r of results) {
      if (r.status === "linked") {
        out(`linked: ${basename(r.secondaryDir)} → shared store (${r.merged.length} session(s) merged${r.collisions.length ? `, ${r.collisions.length} skipped (already present or unsafe dest)` : ""})`);
      } else if (r.status === "already-linked") {
        out(`already shared: ${basename(r.secondaryDir)} (no change)`);
      } else if (r.status === "unlinked") {
        if (r.restoreError) {
          out(`unlinked: ${basename(r.secondaryDir)} — WARNING: restore failed (${r.restoreError.code}); your sessions are safe in ${r.restoreError.backup}, restore it by hand`);
        } else {
          out(`unlinked: ${basename(r.secondaryDir)} (${r.restored ? `restored ${r.restored}` : "reset to empty store"})`);
        }
      } else if (r.status === "link-failed") {
        out(`link FAILED: ${basename(r.secondaryDir)} (${r.error || "error"}) — store left intact${r.backup ? `; backup at ${basename(r.backup)}` : ""}`);
        if (process.platform === "win32" && (r.error === "EPERM" || r.error === "EACCES")) {
          out("    Windows refused both a junction and a symlink here. A junction needs no");
          out("    admin rights, so this usually means the volume is not NTFS or the dir is");
          out("    on a network/mapped drive — move the config dirs under %USERPROFILE%.");
        }
      } else if (r.status === "primary-not-real-dir") {
        out(`skipped: ${basename(r.secondaryDir)} — the primary store is itself a symlink; fix that first (link would loop)`);
      } else {
        out(`${basename(r.secondaryDir)}: ${r.status}`);
      }
    }
    if (!opts.undo) {
      out("");
      out("Safety: never --resume the SAME session id on two accounts at once.");
    }
    return 0;
  }

  out(`sdtk account: unknown subcommand '${opts.sub}'.`);
  out(HELP_TEXT);
  return 0;
}

module.exports = { cmdAccount, parseArgs, renderStatus, fmtHeadroom };
