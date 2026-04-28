/**
 * Unit tests for pure helpers in teacherAssignment.helpers.
 * Run with: `node --test server/src/modules/teachers/teacherAssignment.helpers.test.js`
 *
 * These tests intentionally have no DB / Sequelize dependencies — they exercise
 * the validation and shaping logic that protects the teacher dashboard endpoints.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isUuid,
  parsePositiveInt,
  shapeAssignmentRow,
  validateCreateAssignmentInput,
  summarizeAssignments,
} = require('./teacherAssignment.helpers');

test('isUuid accepts canonical UUIDs', () => {
  assert.equal(isUuid('123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(isUuid('123E4567-E89B-42D3-A456-426614174000'), true);
});

test('isUuid rejects non-strings and malformed input', () => {
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid(12345), false);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid('123e4567-e89b-12d3-a456'), false);
  assert.equal(isUuid('123e4567e89b12d3a456426614174000'), false);
});

test('parsePositiveInt parses positive integers', () => {
  assert.equal(parsePositiveInt('1'), 1);
  assert.equal(parsePositiveInt('100'), 100);
  assert.equal(parsePositiveInt(7), 7);
  assert.equal(parsePositiveInt('  42 '), 42);
});

test('parsePositiveInt rejects zero, negatives, and non-numeric input', () => {
  assert.equal(parsePositiveInt('0'), null);
  assert.equal(parsePositiveInt('-1'), null);
  assert.equal(parsePositiveInt('abc'), null);
  assert.equal(parsePositiveInt(''), null);
  assert.equal(parsePositiveInt(null), null);
  assert.equal(parsePositiveInt(undefined), null);
  assert.equal(parsePositiveInt(NaN), null);
});

test('shapeAssignmentRow returns minimal teacher-safe shape', () => {
  const out = shapeAssignmentRow({
    id: 'a-id',
    teacher_id: 't-id',
    academic_year_id: 1,
    class_id: 2,
    section_id: 3,
    subject_id: 10,
    subject_name: 'Math',
    subject: { id: 10, name: 'Mathematics', is_active: true, noise: 'x' },
    academicYear: { id: 1, name: '2024-2025', is_active: true, secret: 'hidden' },
    schoolClass: { id: 2, name: 'Grade 9', extra: 'noise' },
    section: { id: 3, name: 'A', noise: true },
  });
  assert.deepEqual(out, {
    id: 'a-id',
    teacher_id: 't-id',
    academic_year_id: 1,
    class_id: 2,
    section_id: 3,
    subject_id: 10,
    subject_name: 'Mathematics',
    academicYear: { id: 1, name: '2024-2025' },
    subject: { id: 10, name: 'Mathematics' },
    schoolClass: { id: 2, name: 'Grade 9' },
    section: { id: 3, name: 'A' },
  });
});

test('shapeAssignmentRow returns nulls for missing relations', () => {
  const out = shapeAssignmentRow({
    id: 'a',
    teacher_id: 't',
    academic_year_id: 1,
    class_id: 2,
    section_id: 3,
    subject_name: 'Math',
  });
  assert.equal(out.academicYear, null);
  assert.equal(out.subject, null);
  assert.equal(out.schoolClass, null);
  assert.equal(out.section, null);
});

test('validateCreateAssignmentInput rejects missing fields', () => {
  const r = validateCreateAssignmentInput({});
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.message, /required/);
});

test('validateCreateAssignmentInput rejects non-positive integer ids', () => {
  const r = validateCreateAssignmentInput({
    academic_year_id: -1,
    class_id: 2,
    section_id: 3,
    subject_id: 1,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('validateCreateAssignmentInput accepts valid input', () => {
  const r = validateCreateAssignmentInput({
    academic_year_id: '1',
    class_id: '2',
    section_id: '3',
    subject_id: '4',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    academic_year_id: 1,
    class_id: 2,
    section_id: 3,
    subject_id: 4,
  });
});

test('validateCreateAssignmentInput rejects missing subject_id', () => {
  const r = validateCreateAssignmentInput({
    academic_year_id: 1,
    class_id: 2,
    section_id: 3,
  });
  assert.equal(r.ok, false);
});

test('summarizeAssignments returns [] for empty input', () => {
  assert.deepEqual(summarizeAssignments([]), []);
});

test('summarizeAssignments groups by class, dedupes sections, and sorts subjects', () => {
  const rows = [
    {
      schoolClass: { id: 9, name: 'Grade 9' },
      section: { id: 90, name: 'A' },
      subject_name: 'Physics',
    },
    {
      schoolClass: { id: 9, name: 'Grade 9' },
      section: { id: 90, name: 'A' },
      subject_name: 'Chemistry',
    },
    {
      schoolClass: { id: 9, name: 'Grade 9' },
      section: { id: 91, name: 'B' },
      subject_name: 'Physics',
    },
    {
      schoolClass: { id: 10, name: 'Grade 10' },
      section: { id: 100, name: 'A' },
      subject_name: 'English',
    },
  ];
  const out = summarizeAssignments(rows);
  const grade9 = out.find((c) => c.class_id === 9);
  const grade10 = out.find((c) => c.class_id === 10);
  assert.ok(grade9);
  assert.ok(grade10);
  assert.equal(grade9.sections.length, 2);
  const secA = grade9.sections.find((s) => s.section_id === 90);
  assert.deepEqual(secA.subjects, ['Chemistry', 'Physics']);
  const secB = grade9.sections.find((s) => s.section_id === 91);
  assert.deepEqual(secB.subjects, ['Physics']);
  assert.deepEqual(grade10.sections[0].subjects, ['English']);
});

test('summarizeAssignments ignores rows with no class', () => {
  const out = summarizeAssignments([
    { schoolClass: null, section: { id: 1, name: 'A' }, subject_name: 'X' },
  ]);
  assert.deepEqual(out, []);
});

test('summarizeAssignments ignores rows with no section', () => {
  const out = summarizeAssignments([
    {
      schoolClass: { id: 1, name: 'Grade 1' },
      section: null,
      subject_name: 'X',
    },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sections, []);
});
