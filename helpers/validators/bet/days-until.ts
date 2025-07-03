import { z } from 'zod';
import { baseBetSchema } from './base.ts';

export const daysUntilBetSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const createDaysUntilBetSchema = baseBetSchema.merge(
  z.object({
    marketType: z.literal("days-until"),
    bet: daysUntilBetSchema,
  })
);
