import { Select } from "@/components/ui/field";
import { ROLE_LABEL } from "./role-label";

interface RoleSelectProps {
  id: string;
  label: string;
  defaultValue: keyof typeof ROLE_LABEL;
  /** Visually hide the label when the surrounding row already names the field. */
  hideLabel?: boolean;
}

export function RoleSelect({ id, label, defaultValue, hideLabel }: RoleSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium text-slate-700"}>
        {label}
      </label>
      <Select id={id} name="role" defaultValue={defaultValue}>
        {Object.entries(ROLE_LABEL).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </Select>
    </div>
  );
}
