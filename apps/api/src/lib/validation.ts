import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";

export function jsonValidator<T extends z.ZodType>(schema: T) {
  return zValidator("json", schema, (result, context) => {
    if (!result.success) {
      return context.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request body is invalid",
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        400,
      );
    }
  });
}

export function queryValidator<T extends z.ZodType>(schema: T) {
  return zValidator("query", schema, (result, context) => {
    if (!result.success) {
      return context.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Query parameters are invalid",
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        400,
      );
    }
  });
}

export function paramValidator<T extends z.ZodType>(schema: T) {
  return zValidator("param", schema, (result, context) => {
    if (!result.success) {
      return context.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Path parameters are invalid",
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        400,
      );
    }
  });
}
