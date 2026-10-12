import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";

type NumberFieldProps = {
  label: string;
  value: string;
  step: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export function NumberField({
  label,
  value,
  step,
  placeholder,
  onChange,
}: NumberFieldProps) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min="0"
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
