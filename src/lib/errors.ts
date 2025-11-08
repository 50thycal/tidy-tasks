import type { ErrorObject } from "ajv";

/**
 * Parse AJV validation errors into human-readable format
 */
export function parseAjvErrors(errors: ErrorObject[]): string[] {
  if (!errors || errors.length === 0) {
    return ["Unknown validation error"];
  }

  return errors.map((err) => {
    const field = err.instancePath.replace(/^\//, "").replace(/\//g, ".") || err.params?.missingProperty || "unknown";
    const message = err.message || "invalid";

    // Add context for specific error types
    if (err.keyword === "type") {
      return `${field}: must be ${err.params.type}`;
    } else if (err.keyword === "enum") {
      return `${field}: must be one of [${err.params.allowedValues?.join(", ")}]`;
    } else if (err.keyword === "required") {
      return `${err.params.missingProperty}: is required`;
    } else if (err.keyword === "format") {
      return `${field}: must be valid ${err.params.format}`;
    } else if (err.keyword === "minLength") {
      return `${field}: too short (min ${err.params.limit})`;
    } else if (err.keyword === "maxLength") {
      return `${field}: too long (max ${err.params.limit})`;
    } else if (err.keyword === "minimum") {
      return `${field}: must be >= ${err.params.limit}`;
    } else if (err.keyword === "maximum") {
      return `${field}: must be <= ${err.params.limit}`;
    }

    return `${field}: ${message}`;
  });
}

/**
 * Format AJV errors into a compact single line for UI display
 */
export function formatErrorCompact(errors: ErrorObject[] | string): string {
  if (typeof errors === "string") {
    return errors;
  }

  const messages = parseAjvErrors(errors);
  return messages.join("; ");
}

/**
 * Extract error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    // Try to extract from common error response structures
    const err = error as any;

    if (err.error) {
      return typeof err.error === "string" ? err.error : extractErrorMessage(err.error);
    }

    if (err.message) {
      return err.message;
    }

    if (err.errors && Array.isArray(err.errors)) {
      return formatErrorCompact(err.errors);
    }
  }

  return "Unknown error";
}
