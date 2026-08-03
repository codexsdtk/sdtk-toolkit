#!/usr/bin/env node
"use strict";

// Bin shim — re-exports the sdtk-wiki CLI from the sdtk-wiki-kit dependency.
// See bin/sdtk-spec.js for the rationale behind these shims.
require("sdtk-wiki-kit/bin/sdtk-wiki.js");
