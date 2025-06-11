import { z } from "zod";
import { baseBetSchema } from "./base";

export const discreteBetSchema = z.object({
  options: z.string().array(),
});

export const createDiscreteBetSchema = baseBetSchema.merge(
  z.object({
    marketType: z.literal("discrete"),
    bet: discreteBetSchema,
  })
);
