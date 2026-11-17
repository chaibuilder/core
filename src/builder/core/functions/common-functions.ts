import { ClassValue, clsx } from "cnfast";
import { isEmpty, startsWith } from "lodash-es";
import { nanoid } from "nanoid";
import { twMerge } from "cnfast";

/**
 * Check the passed value and converts it to valid css property value
 * @param value
 */
export function getBgImageValue(value: string) {
  if (isEmpty(value)) return "";
  return startsWith(value, "http") ? `url('${value}')` : value.replace(";", "");
}

/**
 * Get the unique uuid
 */
export function generateUuid(length: number = 6): string {
  return nanoid(length);
}

export const getBreakpointValue = (width: number) =>
  width >= 1536
    ? "2XL"
    : width >= 1280
      ? "XL"
      : width >= 1024
        ? "LG"
        : width >= 768
          ? "MD"
          : width >= 640
            ? "SM"
            : "XS";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
