import { debounce } from "lodash-es";
import { useEffect, useMemo, useState } from "react";
import { Slider } from "~/components/ui/slider";

type BorderRadiusInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const BorderRadiusInput = ({ value, onChange, disabled }: BorderRadiusInputProps) => {
  const [_value, _setValue] = useState(value);
  const debouncedChange = useMemo(() => debounce(onChange, 150), [onChange]);

  useEffect(() => () => debouncedChange.cancel(), [debouncedChange]);

  useEffect(() => {
    // Presets, number input edits and discard must supersede pending slider edits.
    debouncedChange.cancel();
    _setValue(value);
  }, [value, debouncedChange]);

  return (
    <Slider
      min={0}
      step={1}
      max={50}
      disabled={disabled}
      value={[Number(_value.replace("px", "")) || 0]}
      onValueChange={(value) => {
        _setValue(value[0].toString() + "px");
        debouncedChange(value[0].toString());
      }}
      onValueCommit={(value) => {
        debouncedChange.cancel();
        onChange(value[0].toString());
      }}
      className="flex-1 cursor-pointer"
    />
  );
};

export default BorderRadiusInput;
