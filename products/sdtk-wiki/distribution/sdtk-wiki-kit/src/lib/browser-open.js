"use strict";

const { execFile } = require("child_process");

function openBrowser(url) {
  return new Promise((resolve) => {
    let cmd;
    let args;

    if (process.platform === "win32") {
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
        console.error(`[wiki] Warning: could not open browser: ${err.message}`);
      }
      resolve();
    });
  });
}

module.exports = {
  openBrowser,
};
