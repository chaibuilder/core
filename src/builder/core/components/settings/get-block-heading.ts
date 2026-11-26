import i18n from "~/builder/core/locales/load";

/** "Nav (Box)" for a renamed block; just "Box" when the name is absent or equals the type. */
export const getBlockHeading = (block: { _name?: string; _type: string }) => {
  const rawType = block._type.split("/").pop() || block._type;
  const type = rawType ? i18n.t(rawType) : rawType;
  const name = block._name || type;
  return name === type ? name : `${name} (${type})`;
};
