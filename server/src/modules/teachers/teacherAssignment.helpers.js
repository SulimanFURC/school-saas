/**
 * Pure helpers shared by teacher assignment controller code.
 * These have NO database / Sequelize dependencies so they can be safely
 * unit-tested in isolation.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function parsePositiveInt(raw) {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shapeAssignmentRow(plain) {
  const subjectName =
    (plain.subject && plain.subject.name ? String(plain.subject.name) : '') ||
    (plain.subject_name != null ? String(plain.subject_name) : '');
  return {
    id: plain.id,
    teacher_id: plain.teacher_id,
    academic_year_id: plain.academic_year_id,
    class_id: plain.class_id,
    section_id: plain.section_id,
    subject_id: plain.subject_id ?? null,
    subject_name: subjectName,
    academicYear: plain.academicYear
      ? { id: plain.academicYear.id, name: plain.academicYear.name }
      : null,
    subject: plain.subject ? { id: plain.subject.id, name: plain.subject.name } : null,
    schoolClass: plain.schoolClass
      ? { id: plain.schoolClass.id, name: plain.schoolClass.name }
      : null,
    section: plain.section ? { id: plain.section.id, name: plain.section.name } : null,
  };
}

/**
 * Validate the body of a "create assignment" request.
 * Returns either { ok: true, value: { ... } } or { ok: false, status, message }.
 */
function validateCreateAssignmentInput(body) {
  const academicYearId = parsePositiveInt(body.academic_year_id);
  const classId = parsePositiveInt(body.class_id);
  const sectionId = parsePositiveInt(body.section_id);
  const subjectId = parsePositiveInt(body.subject_id);

  if (!academicYearId || !classId || !sectionId || !subjectId) {
    return {
      ok: false,
      status: 400,
      message:
        'academic_year_id, class_id, section_id and subject_id are required',
    };
  }
  return {
    ok: true,
    value: {
      academic_year_id: academicYearId,
      class_id: classId,
      section_id: sectionId,
      subject_id: subjectId,
    },
  };
}

/**
 * Group flat assignment rows by class for dashboard cards.
 * Sections within a class are de-duplicated; subjects are listed per section.
 */
function summarizeAssignments(plainRows) {
  const map = new Map();
  for (const r of plainRows) {
    const cls = r.schoolClass;
    if (!cls) continue;
    const key = String(cls.id);
    if (!map.has(key)) {
      map.set(key, {
        class_id: cls.id,
        class_name: cls.name,
        sections: new Map(),
      });
    }
    const entry = map.get(key);
    if (r.section) {
      const secKey = String(r.section.id);
      if (!entry.sections.has(secKey)) {
        entry.sections.set(secKey, {
          section_id: r.section.id,
          section_name: r.section.name,
          subjects: new Set(),
        });
      }
      entry.sections.get(secKey).subjects.add(r.subject_name);
    }
  }
  return Array.from(map.values()).map((c) => ({
    class_id: c.class_id,
    class_name: c.class_name,
    sections: Array.from(c.sections.values())
      .map((s) => ({
        section_id: s.section_id,
        section_name: s.section_name,
        subjects: Array.from(s.subjects).sort(),
      }))
      .sort((a, b) => a.section_name.localeCompare(b.section_name)),
  }));
}

module.exports = {
  isUuid,
  parsePositiveInt,
  shapeAssignmentRow,
  validateCreateAssignmentInput,
  summarizeAssignments,
};
