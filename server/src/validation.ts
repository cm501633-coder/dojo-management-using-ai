import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid date in YYYY-MM-DD format.');

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
});

export const memberSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional().transform((value) => value || null),
  beltRank: z.string().trim().min(1).max(40).default('White belt'),
  joinedOn: isoDate.optional(),
});

export const attendanceSchema = z.object({
  memberId: z.string().uuid(),
  attendanceDate: isoDate.optional(),
});

export const feeSchema = z.object({
  memberId: z.string().uuid(),
  amount: z.number().finite().min(0.01).max(1000000)
    .refine((value) => Math.round(value * 100) / 100 === value, 'Use no more than two decimal places.'),
  feePeriod: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM for the fee period.'),
  paidOn: isoDate.optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank transfer', 'other']).default('cash'),
  note: z.string().trim().max(255).optional().transform((value) => value || null),
});

export const dateQuerySchema = isoDate;
