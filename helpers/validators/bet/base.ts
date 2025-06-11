import { z } from "zod";

export const baseBetSchema = z.object({
  type: z.enum(["calldata", "args"]).default("calldata"),
  value: z.coerce.string(),
});
