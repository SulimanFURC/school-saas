const { z } = require('zod');

const examIdParam = z.object({ id: z.string().uuid() });
const examEntryParam = z.object({ id: z.string().uuid(), entryId: z.string().uuid() });
const examStudentParam = z.object({ id: z.string().uuid(), studentId: z.string().uuid() });
const examClassParam = z.object({ id: z.string().uuid(), classId: z.coerce.number().int().positive() });
const recheckParam = z.object({ requestId: z.string().uuid() });

const gradesIdParam = z.object({ id: z.coerce.number().int().positive() });

module.exports = {
  examIdParam,
  examEntryParam,
  examStudentParam,
  examClassParam,
  recheckParam,
  gradesIdParam,
};
