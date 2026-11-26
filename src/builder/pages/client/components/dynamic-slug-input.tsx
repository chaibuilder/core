"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "~/components/ui/input";

interface DynamicSlugInputProps {
  /** Id of the input, for its `<Label htmlFor>`. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  dynamicPattern: string;
  onValidationChange?: (isValid: boolean) => void;
}

/**
 * A specialized input component for dynamic slugs that shows a fixed pattern
 * that cannot be deleted, and allows users to add content after it.
 */
export function DynamicSlugInput({
  id,
  value,
  onChange,
  placeholder = "Enter custom slug part",
  dynamicPattern,
  onValidationChange,
}: DynamicSlugInputProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The displayed value should always have the dynamic pattern at the beginning
  const [displayValue, setDisplayValue] = useState(dynamicPattern + value);

  // Update display value when the value prop changes
  useEffect(() => {
    setDisplayValue(dynamicPattern + value);
  }, [value, dynamicPattern]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;

    // Ensure the dynamic pattern is always present
    if (!input.startsWith(dynamicPattern)) {
      // If user tries to delete the pattern, restore it
      const userPart = input.replace(dynamicPattern, "");
      const correctedValue = dynamicPattern + userPart;
      setDisplayValue(correctedValue);

      // Only update the parent with the user's part (without the pattern)
      onChange(userPart);
      return;
    }

    // Extract the user's part (after the pattern)
    const userPart = input.substring(dynamicPattern.length);

    // Sanitize the user's part - only allow letters, numbers, hyphens, underscores, and at most one dot
    const sanitizedUserPart = userPart
      .replace(/\//g, "") // Remove slashes
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/[^a-zA-Z0-9-_.]/g, "-") // Replace other non-allowed chars with hyphens
      .replace(/-+/g, "-") // Replace multiple consecutive hyphens with a single one
      .replace(/^-+/, "") // Remove leading hyphens
      .toLowerCase();

    // Check if there are multiple dots in the user part
    const dotCount = (sanitizedUserPart.match(/\./g) || []).length;
    const isValid = dotCount <= 1;

    // Set error message if there are multiple dots
    if (dotCount > 1) {
      setError("Invalid slug. Only one dot (.) is allowed in the slug");
    } else {
      setError(null);
    }

    // Notify parent component about validation status if callback is provided
    if (onValidationChange) {
      onValidationChange(isValid);
    }

    // Update the display value with the pattern + sanitized user part
    const newDisplayValue = dynamicPattern + sanitizedUserPart;
    setDisplayValue(newDisplayValue);

    // Only update the parent with the user's part (without the pattern)
    onChange(sanitizedUserPart);
  };

  // Focus handler to ensure cursor is placed after the pattern
  const handleFocus = () => {
    if (inputRef.current) {
      const input = inputRef.current;
      // Set cursor position after the dynamic pattern
      setTimeout(() => {
        const position = dynamicPattern.length;
        input.setSelectionRange(position, position);
      }, 0);
    }
  };

  // Click handler to ensure cursor is placed after the pattern
  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const cursorPosition = input.selectionStart || 0;

    // If cursor is placed before or within the pattern, move it after the pattern
    if (cursorPosition <= dynamicPattern.length) {
      setTimeout(() => {
        const position = dynamicPattern.length;
        input.setSelectionRange(position, position);
      }, 0);
    }
  };

  return (
    <div>
      <div className="relative">
        <p className="mb-2 text-xs text-gray-500">
          {t("{{pattern}} is a dynamic segment of slug", { pattern: dynamicPattern })}
        </p>
        <Input
          id={id}
          ref={inputRef}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onClick={handleClick}
          placeholder={placeholder}
          className={error ? "border-red-500" : ""}
        />
        {error && <div className="mt-1 text-xs text-red-500">{error}</div>}
      </div>
    </div>
  );
}
