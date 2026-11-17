import { ComponentType, LazyExoticComponent, ReactNode, Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";

type LeafStringValues<T> = T extends string ? T : T extends object ? LeafStringValues<T[keyof T]> : never;
export type ChaiSlotId = LeafStringValues<typeof CHAI_SLOT_IDS> | (string & {});

export type ChaiSlotComponent = ComponentType<any> | LazyExoticComponent<ComponentType<any>>;

export interface ChaiSlotProps {
  slotId: ChaiSlotId;
  context?: Record<string, any>;
  multiple?: boolean;
  defaultComponent?: ComponentType<any> | null;
  fallback?: ReactNode;
}

/** @internal */
export const SLOT_REGISTRY: Record<string, ChaiSlotComponent[]> = {};

export const registerChaiSlot = (slotId: ChaiSlotId, component: ChaiSlotComponent): void => {
  if (!SLOT_REGISTRY[slotId]) {
    SLOT_REGISTRY[slotId] = [];
  }
  SLOT_REGISTRY[slotId].push(component);
};

export const useChaiSlot = (slotId: ChaiSlotId): ChaiSlotComponent[] => {
  return useMemo(() => SLOT_REGISTRY[slotId] ?? [], [slotId]);
};

const isLazyComponent = (component: ChaiSlotComponent): component is LazyExoticComponent<ComponentType<any>> => {
  return component && typeof component === "object" && "$$typeof" in component;
};

export const ChaiSlot = ({
  slotId,
  context = {},
  multiple = true,
  defaultComponent: DefaultComponent,
  fallback = null,
}: ChaiSlotProps) => {
  const components = useChaiSlot(slotId);

  // No components registered - render default if provided
  if (components.length === 0) {
    return DefaultComponent ? <DefaultComponent {...context} /> : null;
  }

  // Single mode: render only last component
  const componentsToRender = multiple ? components : [components[components.length - 1]];

  // Check if any lazy components
  const hasLazy = componentsToRender.some((comp) => isLazyComponent(comp));

  const content = (
    <>
      {componentsToRender.map((Component, i) => (
        <ErrorBoundary
          key={`${slotId}-${i}`}
          fallback={null}
          onError={(err) => {
            console.error(`[ChaiBuilder] Error in slot "${slotId}" component #${i}:`, err);
          }}>
          <Component {...context} />
        </ErrorBoundary>
      ))}
    </>
  );

  return hasLazy ? <Suspense fallback={fallback}>{content}</Suspense> : content;
};
