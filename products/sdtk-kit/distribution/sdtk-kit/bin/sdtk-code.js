#!/usr/bin/env node
"use strict";

// Bin shim — re-exports the sdtk-code CLI from the sdtk-code-kit dependency.
// See bin/sdtk-spec.js for the rationale behind these shims.
require("sdtk-code-kit/bin/sdtk-code.js");
