import { z } from "zod";

const baseMarketMetadataSchema = z.object({
  image: z.string().optional(),
  color: z.string().optional(),
  unit: z
    .object({
      prefix: z.string().optional(),
      suffix: z.string().optional(),
    })
    .optional(),
  tags: z.array(z.string()),
});

export const normalMarketMetadataSchema = baseMarketMetadataSchema;
export const percentageMarketMetadataSchema = baseMarketMetadataSchema;
export const daysUntilMarketMetadataSchema = baseMarketMetadataSchema;

export const scoreMarketSideMetadataSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
});

export const scoreMarketMetadataSchema = z
  .object({
    firstSide: scoreMarketSideMetadataSchema,
    secondSide: scoreMarketSideMetadataSchema,
  })
  .extend(baseMarketMetadataSchema.shape);

const discreteMarketMetadataOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/)
    .optional(),
  image: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const discreteMarketMetadataSchema = z
  .object({
    options: z.array(discreteMarketMetadataOptionSchema),
  })
  .extend(baseMarketMetadataSchema.shape);

export const marketMetadataSchema = z.union([
  discreteMarketMetadataSchema,
  daysUntilMarketMetadataSchema,
  scoreMarketMetadataSchema,
  normalMarketMetadataSchema,
  percentageMarketMetadataSchema,
]);

export type MarketMetadata = z.infer<typeof marketMetadataSchema>;

export type NormalMarketMetadata = z.infer<typeof normalMarketMetadataSchema>;
export type PercentageMarketMetadata = z.infer<typeof percentageMarketMetadataSchema>;
export type DaysUntilMarketMetadata = z.infer<typeof daysUntilMarketMetadataSchema>;
export type ScoreMarketMetadata = z.infer<typeof scoreMarketMetadataSchema>;
export type DiscreteMarketMetadata = z.infer<typeof discreteMarketMetadataSchema>;
