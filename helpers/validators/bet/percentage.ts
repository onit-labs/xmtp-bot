import { z } from 'zod';
import { baseBetSchema } from './base.ts';

export const percentageBetSchema = z.object({
  percentage: z.number(),
  range: z.number(),
});

export const createPercentageBetSchema = baseBetSchema.merge(
  z.object({
    marketType: z.literal("percentage"),
    bet: percentageBetSchema,
  })
);
