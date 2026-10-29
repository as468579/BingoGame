'use strict';

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

module.exports = { fail };
