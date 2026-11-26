"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const parseValueToPairs = (val: string): KeyValuePair[] => {
  try {
    const parsed = JSON.parse(val || "{}");
    const newPairs = Object.entries(parsed).map(([k, v]) => ({
      key: k,
      value: String(v),
    }));
    return newPairs.length > 0 ? newPairs : [{ key: "", value: "" }];
  } catch {
    return [{ key: "", value: "" }];
  }
};

export const KeyValueEditor = ({ value, onChange, disabled = false }: KeyValueEditorProps) => {
  const { t } = useTranslation();
  const lastEmittedValue = useRef<string>(value);
  const [prevValue, setPrevValue] = useState(value);
  const [pairs, setPairs] = useState<KeyValuePair[]>(() => parseValueToPairs(value));

  // getDerivedStateFromProps pattern: sync when value changes externally
  if (value !== prevValue) {
    setPrevValue(value);
    setPairs(parseValueToPairs(value));
  }

  const emitChange = useCallback(
    (newPairs: KeyValuePair[]) => {
      const obj: Record<string, string> = {};
      newPairs.forEach((p) => {
        if (p.key.trim()) {
          obj[p.key.trim()] = p.value;
        }
      });
      const newValue = JSON.stringify(obj);
      lastEmittedValue.current = newValue;
      onChange(newValue);
    },
    [onChange],
  );

  const handleAddPair = () => {
    const newPairs = [...pairs, { key: "", value: "" }];
    setPairs(newPairs);
    // Don't emit change yet, wait for user to type
  };

  const handleRemovePair = (index: number) => {
    const newPairs = pairs.filter((_, i) => i !== index);
    const finalPairs = newPairs.length > 0 ? newPairs : [{ key: "", value: "" }];
    setPairs(finalPairs);
    emitChange(finalPairs);
  };

  const handleChange = (index: number, field: keyof KeyValuePair, val: string) => {
    const newPairs = [...pairs];
    newPairs[index] = { ...newPairs[index], [field]: val };
    setPairs(newPairs);
    emitChange(newPairs);
  };

  return (
    <div className="bg-surface space-y-2">
      {pairs.map((pair, index) => (
        <div key={index} className="group flex items-center gap-2 transition-all duration-200">
          <div className="grid flex-1 grid-cols-2 gap-2">
            <Input
              placeholder={`Tag ${index + 1}`}
              value={pair.key}
              onChange={(e) => handleChange(index, "key", e.target.value)}
              disabled={disabled}
            />
            <Input
              placeholder={`Content ${index + 1}`}
              value={pair.value}
              onChange={(e) => handleChange(index, "value", e.target.value)}
              disabled={disabled}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => handleRemovePair(index)}
            disabled={disabled}
            className="h-7 w-7 text-muted-foreground transition-colors duration-300 hover:bg-destructive/5 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border pt-1">
        <span className="text-[9px] font-normal uppercase tracking-widest text-muted-foreground">
          {t("Meta Tags List")}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddPair}
          disabled={disabled}
          className="h-6 font-light">
          <Plus />
          {t("Add Meta Tag")}
        </Button>
      </div>
    </div>
  );
};
