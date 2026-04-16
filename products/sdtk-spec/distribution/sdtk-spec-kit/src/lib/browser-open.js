"use strict";

const { execFile } = require("child_process");

/**
 * Open a URL in the default system browser.
 * Cross-platform: Windows, macOS, Linux.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
function openBrowser(url) {
  return new Promise((resolve) => {
    let cmd;
    let args;

    if (process.platform === "win32") {
      // On Windows: cmd /c start "" <url>
      cmd = "cmd";
      args = ["/c", "start", "", url];
    } else if (process.platform === "darwin") {
      cmd = "open";
      args = [url];
    } else {
      cmd = "xdg-open";
      args = [url];
    }

    execFile(cmd, args, { windowsHide: true }, (err) => {
      if (err) {
        // Non-fatal: browser open failure should not crash the CLI
        console.error(`[atlas] Warning: could not open browser: ${err.message}`);
      }
      resolve();
    });
  });
}

module.exports = { openBrowser };
