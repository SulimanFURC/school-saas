const { BOARD_GRADE_THRESHOLD } = require('./exam.constants');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

function parsePositiveInt(raw) {
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extract the first integer occurring in a class name and return it as a grade
 * level. Examples: "Grade 10" -> 10, "Class 9th" -> 9, "Playgroup" -> null.
 */
function parseGradeLevel(name) {
  if (name == null) return null;
  const m = String(name).match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Internal exams are not allowed for board-level classes (Grade 9+).
 * Names without a recognisable grade number (e.g. Playgroup, Nursery) are allowed.
 */
function isClassAllowedForInternalExam(className) {
  const grade = parseGradeLevel(className);
  if (grade == null) return true;
  return grade < BOARD_GRADE_THRESHOLD;
}

function isValidTime(v) {
  return typeof v === 'string' && TIME_RE.test(v);
}

function isValidDate(v) {
  return typeof v === 'string' && DATE_RE.test(v);
}

function timeToMinutes(t) {
  const [hh, mm] = String(t).split(':').map((x) => parseInt(x, 10));
  return hh * 60 + mm;
}

/**
 * Returns true if [aStart, aEnd] overlaps [bStart, bEnd].
 * Times are 'HH:MM' strings.
 */
function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const a1 = timeToMinutes(aStart);
  const a2 = timeToMinutes(aEnd);
  const b1 = timeToMinutes(bStart);
  const b2 = timeToMinutes(bEnd);
  return a1 < b2 && b1 < a2;
}

/**
 * Resolve the current effective lifecycle status given a stored status and
 * exam dates. We do not auto-update the DB on read — controllers may persist
 * the change when needed (or rely on this for visibility checks).
 */
function deriveLiveStatus(stored, startDateStr, endDateStr, today = new Date()) {
  if (
    stored === 'archived' ||
    stored === 'published' ||
    stored === 'result_pending' ||
    stored === 'draft'
  ) {
    return stored;
  }
  const todayStr = today.toISOString().slice(0, 10);
  if (stored === 'scheduled') {
    if (todayStr >= startDateStr && todayStr <= endDateStr) return 'ongoing';
    if (todayStr > endDateStr) return 'result_pending';
    return 'scheduled';
  }
  if (stored === 'ongoing') {
    if (todayStr > endDateStr) return 'result_pending';
    return 'ongoing';
  }
  return stored;
}

module.exports = {
  isUuid,
  parsePositiveInt,
  parseGradeLevel,
  isClassAllowedForInternalExam,
  isValidTime,
  isValidDate,
  timeToMinutes,
  timeRangesOverlap,
  deriveLiveStatus,
};
