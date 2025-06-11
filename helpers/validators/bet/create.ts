import { z } from "zod";
import { createDaysUntilBetSchema } from "./days-until";
import { createDiscreteBetSchema } from "./discrete";
import { createNormalBetSchema } from "./normal";
import { createPercentageBetSchema } from "./percentage";
import { createScoreBetSchema } from "./score";

export const betSchema = z.preprocess(
  // TODO: extract this to a utility function that is used with all query params in our hono server validators
  (data) => {
    // the data may have had some of its fields stringified by the client
    // we need to parse them back to objects
    if (typeof data === "object" && data !== null) {
      for (const key in data) {
        const value = data[key as keyof typeof data];
        if (typeof value === "string") {
          try {
            // @ts-expect-error:
            data[key] = JSON.parse(value);
          } catch (error) {
            // console.error(`Error parsing ${key}:`, error);
          }
        }
      }
    }

    return data;
  },
  z.discriminatedUnion("marketType", [
    createScoreBetSchema,
    createNormalBetSchema,
    createDiscreteBetSchema,
    createPercentageBetSchema,
    createDaysUntilBetSchema,
  ])
);

export type BetSchemas = z.infer<typeof betSchema>;

export const allCreateBetSchemas = z.union([
  createDaysUntilBetSchema,
  createScoreBetSchema,
  createDiscreteBetSchema,
  createNormalBetSchema,
  createPercentageBetSchema,
]);
