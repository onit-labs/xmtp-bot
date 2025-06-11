import { z } from "zod";
import { baseBetSchema } from "./base";

export const normalBetSchema = z.object({
  mean: z.coerce.number().describe("The mean of the normal distribution"),
  stdDev: z.coerce.number().describe("The standard deviation of the normal distribution"),
});

export const createNormalBetSchema = baseBetSchema.merge(
  z.object({
    marketType: z.literal("normal"),
    bet: normalBetSchema,
  })
);
