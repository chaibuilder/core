export const CHAI_RJSF_EXTENSIONS: Record<string, { id: string; component: React.ComponentType<any>; type: string }> =
  {};

export const registerChaiBlockSettingWidget = (id: string, component: React.ComponentType<any>) => {
  CHAI_RJSF_EXTENSIONS[id] = {
    id,
    component,
    type: "widget",
  };
};

export const registerChaiBlockSettingField = (id: string, component: React.ComponentType<any>) => {
  CHAI_RJSF_EXTENSIONS[id] = {
    id,
    component,
    type: "field",
  };
};

export const registerChaiBlockSettingTemplate = (id: string, component: React.ComponentType<any>) => {
  CHAI_RJSF_EXTENSIONS[id] = {
    id,
    component,
    type: "template",
  };
};

export const useChaiBlockSettingComponents = (
  type: "widget" | "field" | "template",
): Record<string, React.ComponentType<any>> => {
  return Object.values(CHAI_RJSF_EXTENSIONS)
    .filter((component) => component.type === type)
    .reduce(
      (acc, component) => {
        acc[component.id] = component.component;
        return acc;
      },
      {} as Record<string, React.ComponentType<any>>,
    );
};
