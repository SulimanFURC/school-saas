const { z } = require('zod');

const uuidParam = z.object({ id: z.string().uuid() });
const assignmentParam = z.object({ id: z.string().uuid(), assignmentId: z.string().uuid() });

const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
}).passthrough();

const createTeacher = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  email: z.string().email(),
}).passthrough();

const updateTeacher = z.object({}).passthrough();

const changePassword = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6),
});

module.exports = {
  uuidParam,
  assignmentParam,
  listQuery,
  createTeacher,
  updateTeacher,
  changePassword,
};
