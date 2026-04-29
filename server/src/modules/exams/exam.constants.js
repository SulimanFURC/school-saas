/**
 * Domain constants and lifecycle/edit rules for the Exams module.
 * Keep all strings here so controllers/services share a single source of truth.
 */

const EXAM_TYPES = Object.freeze([
  'first_term',
  'second_term',
  'mid_term',
  'final',
  'unit_test',
  'mock',
]);

const EXAM_STATUSES = Object.freeze([
  'draft',
  'scheduled',
  'ongoing',
  'result_pending',
  'published',
  'archived',
]);

/** Statuses where the exam is not yet started — full edit allowed. */
const EXAM_FULLY_EDITABLE_STATUSES = new Set(['draft', 'scheduled']);

/** Statuses where only `end_date` may be edited. */
const EXAM_END_DATE_ONLY_STATUSES = new Set(['ongoing', 'result_pending']);

const MARK_ENTRY_STATUSES = Object.freeze([
  'present',
  'absent',
  'exempted',
  'withheld',
]);

const GRADING_MODES = Object.freeze(['per_subject', 'aggregate']);

const RECHECK_STATUSES = Object.freeze([
  'open',
  'assigned',
  'resolved',
  'rejected',
  'closed',
]);

/** Internal exams may never be created for board-level classes. */
const BOARD_GRADE_THRESHOLD = 9;

module.exports = {
  EXAM_TYPES,
  EXAM_STATUSES,
  EXAM_FULLY_EDITABLE_STATUSES,
  EXAM_END_DATE_ONLY_STATUSES,
  MARK_ENTRY_STATUSES,
  GRADING_MODES,
  RECHECK_STATUSES,
  BOARD_GRADE_THRESHOLD,
};
