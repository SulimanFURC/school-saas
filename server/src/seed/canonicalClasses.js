const SchoolClass = require('../modules/classes/class.model');
const Section = require('../modules/classes/section.model');

/** 14 grades per product spec (no Class 3). */
const CANONICAL_CLASSES = [
  { code: 'PG', name: 'Play group', display_order: 1 },
  { code: 'NURSERY', name: 'Nursery', display_order: 2 },
  { code: 'KG', name: 'KG', display_order: 3 },
  { code: 'C1', name: 'Class 1', display_order: 4 },
  { code: 'C2', name: 'Class 2', display_order: 5 },
  { code: 'C4', name: 'Class 4', display_order: 6 },
  { code: 'C5', name: 'Class 5', display_order: 7 },
  { code: 'C6', name: 'Class 6', display_order: 8 },
  { code: 'C7', name: 'Class 7', display_order: 9 },
  { code: 'C8', name: 'Class 8', display_order: 10 },
  { code: 'C9', name: 'Class 9', display_order: 11 },
  { code: 'C10', name: 'Class 10th', display_order: 12 },
  { code: 'C11', name: 'Class 11th', display_order: 13 },
  { code: 'C12', name: 'Class 12th', display_order: 14 },
];

/**
 * Ensures each canonical class exists for the tenant and has section A.
 */
async function seedCanonicalClassesForTenant(tenantId) {
  for (const row of CANONICAL_CLASSES) {
    const [cls] = await SchoolClass.findOrCreate({
      where: { tenant_id: tenantId, code: row.code },
      defaults: {
        tenant_id: tenantId,
        name: row.name,
        display_order: row.display_order,
        is_active: true,
      },
    });
    if (cls.name !== row.name || cls.display_order !== row.display_order) {
      await cls.update({ name: row.name, display_order: row.display_order, is_active: true });
    }
    await Section.findOrCreate({
      where: { tenant_id: tenantId, class_id: cls.id, name: 'A' },
      defaults: { tenant_id: tenantId, class_id: cls.id, name: 'A' },
    });
  }
}

const CATEGORY_CODES_9_10 = new Set(['C9', 'C10']);
const CATEGORY_CODES_11_12 = new Set(['C11', 'C12']);

const CATEGORIES_9_10 = ['Science', 'Arts'];
const CATEGORIES_11_12 = ['Pre-engineering', 'Medical', 'Computer science'];

function validateEnrollmentCategory(classCode, category) {
  if (category == null || String(category).trim() === '') {
    return { ok: true };
  }
  const c = String(category).trim();
  if (CATEGORY_CODES_9_10.has(classCode)) {
    if (!CATEGORIES_9_10.includes(c)) {
      return {
        ok: false,
        message: `Allowed categories for this class: ${CATEGORIES_9_10.join(', ')}`,
      };
    }
  } else if (CATEGORY_CODES_11_12.has(classCode)) {
    if (!CATEGORIES_11_12.includes(c)) {
      return {
        ok: false,
        message: `Allowed categories for this class: ${CATEGORIES_11_12.join(', ')}`,
      };
    }
  } else if (c) {
    return {
      ok: false,
      message: 'Category is only for Class 9 and 10 (Science/Arts) or Class 11 and 12 (Pre-engineering/Medical/Computer science)',
    };
  }
  return { ok: true };
}

module.exports = {
  CANONICAL_CLASSES,
  seedCanonicalClassesForTenant,
  validateEnrollmentCategory,
  CATEGORY_CODES_9_10,
  CATEGORY_CODES_11_12,
};
