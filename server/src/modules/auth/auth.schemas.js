const { z } = require('zod');

const loginSchema = z.object({
  login: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  password: z.string().min(1),
}).superRefine((data, ctx) => {
  if (!data.login && !data.email) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['login'], message: 'login or email is required' });
  }
});

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

const forgotPasswordSchema = z.object({
  login: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
}).superRefine((data, ctx) => {
  if (!data.login && !data.email) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['login'], message: 'login or email is required' });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1),
  newPassword: z.string().min(6),
});

const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
}).passthrough();

module.exports = {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  logoutSchema,
};
