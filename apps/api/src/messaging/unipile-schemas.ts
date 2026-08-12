import { z } from "zod";

const unknownRecord = z.record(z.string(), z.unknown());

export const unipilePageSchema = z.looseObject({
  data: z.array(z.unknown()).default([]),
  items: z.array(z.unknown()).optional(),
  cursor: z.string().nullish(),
  next_cursor: z.string().nullish(),
  has_more: z.boolean().optional(),
});

export const unipileAccountSchema = z.looseObject({
  id: z.string().optional(),
  account_id: z.string().optional(),
  provider: z.unknown().optional(),
  type: z.unknown().optional(),
  status: z.unknown().optional(),
  name: z.string().nullish(),
  username: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  user: z.unknown().optional(),
});

export const unipileWebhookEnvelopeSchema = z.looseObject({
  type: z.string().min(1),
  id: z.string().nullish(),
  event_id: z.string().nullish(),
  webhook_id: z.string().nullish(),
  account_id: z.string().nullish(),
  data: z.unknown().optional(),
  payload: z.unknown().optional(),
});

export function parseProviderRecord(value: unknown): Record<string, unknown> {
  const result = unknownRecord.safeParse(value);
  return result.success ? result.data : {};
}

export function validateUnipilePage(
  value: unknown,
): z.infer<typeof unipilePageSchema> {
  const result = unipilePageSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Malformed Unipile page response");
  }
  return result.data;
}
