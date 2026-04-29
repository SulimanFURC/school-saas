const test = require('node:test');
const assert = require('node:assert');

test('reports routes module loads', () => {
  assert.ok(require('./modules/reports/reports.routes.js'));
});

test('dashboard routes module loads', () => {
  assert.ok(require('./modules/dashboard/dashboard.routes.js'));
});
