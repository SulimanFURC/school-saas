const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError } = require('./http-error');

test('HttpError carries status and message', () => {
  const err = new HttpError(422, 'Validation failed', { field: 'x' });
  assert.equal(err.status, 422);
  assert.equal(err.message, 'Validation failed');
  assert.equal(err.details?.field, 'x');
  assert.ok(err instanceof Error);
});
