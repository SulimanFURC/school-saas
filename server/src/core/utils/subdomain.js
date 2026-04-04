/** Reserved subdomains that cannot be used by new tenants. */
const RESERVED_SUBDOMAINS = new Set(['platform']);

function normalizeSubdomain(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function isValidSubdomain(s) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 2 && s.length <= 63;
}

module.exports = {
  RESERVED_SUBDOMAINS,
  normalizeSubdomain,
  isValidSubdomain,
};
