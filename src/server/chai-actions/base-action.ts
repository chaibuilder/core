import { z } from "zod";
import { ActionError } from "./action-error";
import { ChaiAction, ChaiActionContext, ChaiRequiredPermission } from "./chai-action-interface";

/**
 * Base Action Class
 * Provides common functionality for all action handlers
 */
export abstract class ChaiBaseAction<T = any, K = any> implements ChaiAction<T, K> {
  protected context: ChaiActionContext | null = null;
  /**
   * Permission required to run this action. Enforced by `runChaiAction`.
   * Override in subclasses. Undefined = authenticated-only (no specific permission).
   */
  public requiredPermission?: ChaiRequiredPermission<T>;
  /**
   * Static superset of the keys {@link requiredPermission} may require. Set by
   * `wp` / `withChaiActionPermission` at registration; see `permission-keys.ts`.
   */
  public declaredPermissionKeys?: string[];
  /**
   * Method to get the validation schema for the action data
   * Each action can override this to define its own validation rules
   */
  protected getValidationSchema(): z.ZodType<any> | any {
    return {};
  }

  /**
   * Validate the action data using the schema provided by getValidationSchema
   * @param data The data to validate
   * @returns true if the data is valid, false otherwise
   */
  validate(data: T): boolean {
    if (!data) return true;
    try {
      const schema = this.getValidationSchema() as any;
      if (schema?.parse) {
        schema.parse(data);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get validation errors for the action data
   * This can be useful for debugging or providing more detailed error messages
   * @param data The data to validate
   * @returns An array of validation errors or null if the data is valid
   */
  getValidationErrors(data: T): string | null {
    if (!data) return null;
    try {
      const schema = this.getValidationSchema() as any;
      if (schema?.parse) {
        schema.parse(data);
      }
      return null;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map((err: any) => `${err.path.join(".")}: ${err.message}`).join(", ");
        return errorMessages;
      }
      return null;
    }
  }

  /**
   * Set the action context
   * @param context The context to set
   */
  setContext(context: ChaiActionContext): void {
    this.context = context;
  }

  /**
   * Abstract method to execute the action
   * Each action must implement this to define its own business logic
   */
  abstract execute(data: T): Promise<any>;

  async run(data: T): Promise<any> {
    if (!this.validate(data)) {
      const validationErrors = this.getValidationErrors(data);
      const message = validationErrors ? `Validation failed: ${validationErrors}` : "Validation failed";
      throw new ActionError(message, "VALIDATION_ERROR");
    }
    return this.execute(data);
  }

  /**
   * Helper method to handle common errors in actions
   * @param error The error to handle
   * @throws ActionError with appropriate message and code
   */
  protected handleError(error: unknown): never {
    if (error instanceof ActionError) {
      // Re-throw ActionError as is
      throw error;
    } else if (error instanceof z.ZodError) {
      // Convert Zod validation errors to ActionError
      const errorMessage = error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new ActionError(`Validation failed: ${errorMessage}`, "VALIDATION_ERROR");
    } else {
      // Convert other errors to ActionError
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new ActionError(message, "ACTION_ERROR");
    }
  }
}
