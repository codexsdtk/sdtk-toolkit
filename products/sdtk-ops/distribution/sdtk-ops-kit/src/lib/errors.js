"use strict";

class CliError extends Error {
  constructor(message, exitCode = 4) {
    super(message);
    this.name = this.constructor.name;
    this.exitCode = exitCode;
  }
}

class ValidationError extends CliError {
  constructor(message) {
    super(message, 1);
  }
}

class DependencyError extends CliError {
  constructor(message) {
    super(message, 2);
  }
}

class IntegrityError extends CliError {
  constructor(message) {
    super(message, 3);
  }
}

class InternalError extends CliError {
  constructor(message) {
    super(message, 4);
  }
}

module.exports = {
  CliError,
  ValidationError,
  DependencyError,
  IntegrityError,
  InternalError,
};
