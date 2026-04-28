/**
 * Canonical class seeding has been removed. Schools now define their own classes
 * (each requires a designated class teacher), so the platform no longer pre-seeds
 * grade-level classes for new tenants.
 *
 * Enrollment categories are no longer enforced server-side because they previously
 * relied on a class `code` (e.g. C9/C10/C11/C12) that has been removed from the
 * data model. Client UIs may still suggest categories by class name; the API
 * accepts any non-empty category string.
 */

function validateEnrollmentCategory(_classCode, _category) {
  return { ok: true };
}

module.exports = {
  validateEnrollmentCategory,
};
