import { z } from "zod";
import { baseBetSchema } from "./base";

export const stringScoreBetSchema = z
  .string()
  .regex(/^\d+-\d+$/)
  .describe("The bet to create in the format of 'firstSideScore-secondSideScore'");

export const stringScoreBetObjectSchema = z.object({
  score: stringScoreBetSchema,
});

export const objectScoreBetSchema = z.object({
  firstSideScore: z.number().describe("The score for the first side"),
  secondSideScore: z.number().describe("The score for the second side"),
});

export const scoreBetSchema = z.object({
  bet: z.union([stringScoreBetObjectSchema, objectScoreBetSchema]),
});

export const createScoreBetSchema = baseBetSchema.merge(
  z.object({
    marketType: z.literal("score"),
    bet: scoreBetSchema.shape.bet,
  })
);
