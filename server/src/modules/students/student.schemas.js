const { z } = require('zod');

const uuid = z.string().uuid();

const studentIdParamSchema = z.object({
  id: uuid,
});

const registerSchema = z.object({
  admission_no: z.string().trim().min(1),
  first_name: z.string().trim().min(1).optional(),
  full_name: z.string().trim().min(1).optional(),
  enrollment: z.object({
    academic_year_id: z.coerce.number().int().positive(),
    class_id: z.coerce.number().int().positive(),
    section_id: z.coerce.number().int().positive(),
    roll_number: z.union([z.number(), z.string()]).optional(),
    category: z.string().optional().nullable(),
  }),
}).passthrough();

const promoteSchema = z.object({
  student_ids: z.array(uuid).min(1),
  to_academic_year_id: z.coerce.number().int().positive().optional(),
  academic_year_id: z.coerce.number().int().positive().optional(),
  to_class_id: z.coerce.number().int().positive().optional(),
  new_class_id: z.coerce.number().int().positive().optional(),
  to_section_id: z.coerce.number().int().positive().optional(),
  new_section_id: z.coerce.number().int().positive().optional(),
}).passthrough();

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
  class_id: z.coerce.number().int().positive().optional(),
  section_id: z.coerce.number().int().positive().optional(),
  academic_year_id: z.coerce.number().int().positive().optional(),
}).passthrough();

const lookupQuerySchema = z.object({
  admission_no: z.string().trim().min(1),
});

const enrollmentsQuerySchema = z.object({
  student_id: uuid,
});

const updateSchema = z.object({}).passthrough();

module.exports = {
  studentIdParamSchema,
  registerSchema,
  promoteSchema,
  listQuerySchema,
  lookupQuerySchema,
  enrollmentsQuerySchema,
  updateSchema,
};
