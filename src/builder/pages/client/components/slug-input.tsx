"use client";

import { useEffect, useState } from "react";
import { formatParentSlug, slugify } from "~/builder/pages/utils/slug-utils";
import { Input } from "~/components/ui/input";

interface SlugInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  parentSlug?: string;
  onValidationChange?: (isValid: boolean) => void;
  disabled?: boolean;
  fullSlug?: string | undefined;
}

export function SlugInput({
  id,
  value,
  onChange,
  placeholder,
  parentSlug,
  onValidationChange,
  disabled = false,
  fullSlug,
}: SlugInputProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;

    // Only allow letters, numbers, hyphens, underscores, and dots
    const sanitized = slugify(input);

    // Check if there are multiple dots
    const dotCount = (sanitized.match(/\./g) || []).length;
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

    setDisplayValue(sanitized);
    onChange(sanitized);
  };

  return (
    <div>
      {parentSlug && (
        <div className="mb-1 flex items-center">
          <span className="text-xs text-muted/70">
            Parent: <span className="font-mono text-foreground/70">{formatParentSlug(parentSlug)}</span>
          </span>
        </div>
      )}
      <div className="relative">
        <Input
          id={id}
          disabled={disabled}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={error ? "border-destructive" : ""}
        />
        {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
      </div>
      {fullSlug && fullSlug !== "undefined" && (
        <div className="mt-1 flex items-center">
          <span className="text-xs text-muted/70">
            Complete Slug: <span className="font-mono text-foreground/70">{fullSlug}</span>
          </span>
        </div>
      )}
    </div>
  );
}
