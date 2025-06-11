import { z } from "zod";
import { daysUntilBetSchema } from "../bet/days-until";
import { discreteBetSchema } from "../bet/discrete";
import { normalBetSchema } from "../bet/normal";
import { percentageBetSchema } from "../bet/percentage";
import { scoreBetSchema } from "../bet/score";
import {
  daysUntilMarketMetadataSchema,
  discreteMarketMetadataSchema,
  normalMarketMetadataSchema,
  percentageMarketMetadataSchema,
  scoreMarketMetadataSchema,
} from "./metadata";
import { Address, isAddress } from "viem";

export const addressSchema = z.string().refine((val): val is Address => isAddress(val));

const baseCreateMarketSchema = z.object({
  question: z.string(),
  resolutionCriteria: z.string(),
  initiator: addressSchema.optional(),
  resolvers: z.array(addressSchema).optional(),
  bettingCutoff: z.coerce.bigint().optional(),
  withdrawlDelayPeriod: z.coerce.bigint().optional(),
  marketCreatorFeeReceiver: addressSchema.optional(),
  marketCreatorCommissionBp: z.coerce.number().min(0).max(400).optional(),
  seededFunds: z.coerce.bigint().optional(),
});

export const createScoreMarketSchema = baseCreateMarketSchema.merge(
  z.object({
    marketType: z.literal("score"),
    metadata: scoreMarketMetadataSchema.optional(),
    initialBet: scoreBetSchema.shape.bet.optional(),
  })
);

export const createPercentageMarketSchema = baseCreateMarketSchema.merge(
  z.object({
    marketType: z.literal("percentage"),
    metadata: percentageMarketMetadataSchema.optional(),
    initialBet: percentageBetSchema,
  })
);

export const createNormalMarketSchema = baseCreateMarketSchema.merge(
  z.object({
    marketType: z.literal("normal"),
    metadata: normalMarketMetadataSchema.optional(),
    initialBet: normalBetSchema.merge(
      z.object({
        outcomeUnit: z.coerce.number(),
      })
    ),
  })
);

export const createDaysUntilMarketSchema = baseCreateMarketSchema.merge(
  z.object({
    marketType: z.literal("days-until"),
    metadata: daysUntilMarketMetadataSchema.optional(),
    initialBet: daysUntilBetSchema,
  })
);

export const createDiscreteMarketSchema = baseCreateMarketSchema.merge(
  z.object({
    marketType: z.literal("discrete"),
    metadata: discreteMarketMetadataSchema,
    initialBet: discreteBetSchema.shape.options,
  })
);
