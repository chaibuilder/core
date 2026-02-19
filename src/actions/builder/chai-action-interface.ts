/**
 * Action Context
 * Contains information and repositories needed by actions
 */
export interface ChaiActionContext {
  appId: string;
  userId?: string;
}

/**
 * ChaiAction Interface
 * Defines the contract for all action handlers
 */
export interface ChaiAction<T = any, K = any> {
  validate(data: T): boolean;
  setContext(context: ChaiActionContext): void;
  execute(data: T): Promise<K>;
}
