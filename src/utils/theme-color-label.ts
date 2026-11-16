/** Display label for a theme color key: "primary-foreground" → "Primary Foreground", "primary" → "Primary Background". */
export const themeColorLabel = (key: string): string => {
  const lower = key.toLowerCase();
  const isSurface = !["foreground", "border", "input", "ring", "background"].some((word) => lower.includes(word));
  return (
    key
      .split(/(?=[A-Z])/)
      .join(" ")
      .replace(/-/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") + (isSurface ? " Background" : "")
  );
};
