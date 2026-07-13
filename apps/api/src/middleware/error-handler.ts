import type { ErrorHandler } from "hono";

import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const errorHandler: ErrorHandler<AppEnv> = (error, context) => {
  const requestId = context.get("requestId");

  if (error instanceof AppError) {
    return context.json(
      { error: { code: error.code, message: error.message, requestId } },
      error.status,
    );
  }

  const databaseCode = (error as { code?: unknown }).code;
  if (databaseCode === "23505") {
    return context.json(
      {
        error: {
          code: "CONFLICT",
          message: "A resource with these unique fields already exists",
          requestId,
        },
      },
      409,
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "request.failed",
      requestId,
      errorName: error.name,
    }),
  );

  return context.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId,
      },
    },
    500,
  );
};
