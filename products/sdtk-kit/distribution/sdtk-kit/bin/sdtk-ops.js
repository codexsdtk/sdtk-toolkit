#!/usr/bin/env node
"use strict";

// Bin shim — re-exports the sdtk-ops CLI from the sdtk-ops-kit dependency.
// See bin/sdtk-spec.js for the rationale behind these shims.
require("sdtk-ops-kit/bin/sdtk-ops.js");
