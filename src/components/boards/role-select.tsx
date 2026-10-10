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
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium"}>
        {label}
      </label>
      <select id={id} name="role" defaultValue={defaultValue} className="rounded border border-gray-300 px-2 py-2 text-sm">
        {Object.entries(ROLE_LABEL).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
