import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import taskSchema from "@/schema/task.json";

// Memoized AJV instance
let ajvInstance: Ajv | null = null;

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, strict: false });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

// Compile the task schema
let validateTaskCompiled: ValidateFunction | null = null;

function getValidateTask(): ValidateFunction {
  if (!validateTaskCompiled) {
    const ajv = getAjv();
    validateTaskCompiled = ajv.compile(taskSchema);
  }
  return validateTaskCompiled;
}

export interface ValidationSuccess {
  ok: true;
}

export interface ValidationError {
  ok: false;
  errors: ErrorObject[];
  fieldErrors: Record<string, string[]>;
}

export type ValidationResult = ValidationSuccess | ValidationError;

/**
 * Validate a task object against the schema
 */
export function validateTask(task: any): ValidationResult {
  const validate = getValidateTask();
  const valid = validate(task);

  if (valid) {
    return { ok: true };
  }

  const errors = validate.errors || [];
  const fieldErrors = mapErrors(errors);

  return {
    ok: false,
    errors,
    fieldErrors,
  };
}

/**
 * Map AJV errors to field-specific error messages
 */
export function mapErrors(errors: ErrorObject[]): Record<string, string[]> {
  const mapped: Record<string, string[]> = {};

  for (const error of errors) {
    // Extract field path from instancePath (e.g., "/title" -> "title")
    let field = error.instancePath.replace(/^\//, "").replace(/\//g, ".");

    // If instancePath is empty, use the property from params
    if (!field && error.params && "missingProperty" in error.params) {
      field = error.params.missingProperty as string;
    }

    // Default to "general" if we can't determine the field
    if (!field) {
      field = "general";
    }

    // Format error message
    let message = error.message || "Invalid value";

    // Add context for specific error types
    if (error.keyword === "minLength") {
      message = `must have at least ${error.params.limit} character${error.params.limit > 1 ? "s" : ""}`;
    } else if (error.keyword === "enum") {
      message = `must be one of: ${(error.params.allowedValues || []).join(", ")}`;
    } else if (error.keyword === "type") {
      message = `must be ${error.params.type}`;
    } else if (error.keyword === "format") {
      message = `must be a valid ${error.params.format}`;
    } else if (error.keyword === "required") {
      message = "is required";
    }

    if (!mapped[field]) {
      mapped[field] = [];
    }
    mapped[field].push(message);
  }

  return mapped;
}
