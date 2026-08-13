import { Hono } from "hono";
import type { Context } from "hono";

import { env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  parseUnipileSignature,
  verifyHmacSha256HexSafe,
} from "../messaging/crypto.js";
import {
  ingestMessagingWebhook,
  processMessagingInboundEvent,
} from "../messaging/service.js";
import { unipileWebhookEnvelopeSchema } from "../messaging/unipile-schemas.js";
import type { AppEnv } from "../types.js";

export const messagingWebhookRoutes = new Hono<AppEnv>();

function background(context: Context<AppEnv>, promise: Promise<unknown>): void {
  const guarded = promise.catch(() => undefined);
  try {
    const executionContext = context.executionCtx;
    if (executionContext && typeof executionContext.waitUntil === "function") {
      executionContext.waitUntil(guarded);
      return;
    }
  } catch {
    // Hono's Node adapter does not expose a Workers ExecutionContext.
  }
  void guarded;
}

messagingWebhookRoutes.post(
  "/unipile",
  rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "messaging-webhook" }),
  async (context) => {
    const secret =
      context.env?.UNIPILE_WEBHOOK_SECRET ?? env.UNIPILE_WEBHOOK_SECRET;
    if (!secret)
      throw new AppError(
        503,
        "WEBHOOK_NOT_CONFIGURED",
        "Messaging webhook verification is not configured",
      );
    const declaredLength = Number(context.req.header("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > 1 * 1024 * 1024)
      return context.json(
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Webhook payload is too large",
          },
        },
        413,
      );
    const rawBody = await context.req.raw.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1 * 1024 * 1024)
      return context.json(
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Webhook payload is too large",
          },
        },
        413,
      );
    const parsedSignature = parseUnipileSignature(
      context.req.header("unipile-signature") ?? null,
    );
    if (
      !parsedSignature ||
      Math.abs(Date.now() / 1000 - parsedSignature.timestamp) > 300 ||
      !(await verifyHmacSha256HexSafe(
        secret,
        `${parsedSignature.timestamp}.${rawBody}`,
        parsedSignature.signature,
      ))
    ) {
      return context.json(
        {
          error: {
            code: "WEBHOOK_VERIFICATION_FAILED",
            message: "Webhook signature is invalid",
          },
        },
        401,
      );
    }
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch {
      return context.json(
        {
          error: {
            code: "MALFORMED_WEBHOOK",
            message: "Webhook body must be JSON",
          },
        },
        400,
      );
    }
    const parsed = unipileWebhookEnvelopeSchema.safeParse(rawPayload);
    if (!parsed.success)
      return context.json(
        {
          error: {
            code: "MALFORMED_WEBHOOK",
            message: "Webhook payload is invalid",
          },
        },
        400,
      );
    const payload = parsed.data;
    const providerPayload =
      payload.data && typeof payload.data === "object"
        ? payload.data
        : payload.payload && typeof payload.payload === "object"
          ? payload.payload
          : rawPayload && typeof rawPayload === "object"
            ? rawPayload
            : {};
    const envelope = {
      type: payload.type,
      providerEventId:
        payload.id ??
        payload.event_id ??
        payload.webhook_id ??
        (typeof (providerPayload as Record<string, unknown>).id === "string"
          ? ((providerPayload as Record<string, unknown>).id as string)
          : null),
      accountId:
        payload.account_id ??
        (typeof (providerPayload as Record<string, unknown>).account_id ===
        "string"
          ? ((providerPayload as Record<string, unknown>).account_id as string)
          : null),
      payload: providerPayload as Record<string, unknown>,
    };
    const accepted = await ingestMessagingWebhook({
      envelope,
      rawPayload: rawPayload as Record<string, unknown>,
    });
    if (!accepted.duplicate)
      background(
        context,
        processMessagingInboundEvent({
          eventId: accepted.event.id,
          bindings: context.env,
        }),
      );
    return context.json(
      {
        accepted: true,
        duplicate: accepted.duplicate,
        eventId: accepted.event.id,
      },
      202,
    );
  },
);
