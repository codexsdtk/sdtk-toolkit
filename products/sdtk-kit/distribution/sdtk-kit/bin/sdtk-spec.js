#!/usr/bin/env node
"use strict";

// Bin shim — re-exports the sdtk-spec CLI from the sdtk-spec-kit dependency.
//
// Why this exists: `npm install -g <pkg>` only links the bin entries of the
// top-level package, NOT of its dependencies. A pure meta-package (deps only,
// no bin) therefore installs the sub-packages but leaves no CLI on PATH.
//
// Each sub-toolkit CLI reads process.argv directly, so requiring its bin
// entry here runs it with the real arguments unchanged.
require("sdtk-spec-kit/bin/sdtk.js");
