"use strict";

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

class ValidationError extends CliError {
  constructor(message) {
    super(message, 1);
    this.name = "ValidationError";
  }
}

class DependencyError extends CliError {
  constructor(message) {
    super(message, 2);
    this.name = "DependencyError";
  }
}

module.exports = {
  CliError,
  DependencyError,
  ValidationError,
};
