import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/field";
import { ROLES } from "./role-label";

interface RoleSelectProps {
  id: string;
  label: string;
  defaultValue: (typeof ROLES)[number];
  /** Visually hide the label when the surrounding row already names the field. */
  hideLabel?: boolean;
}

export function RoleSelect({ id, label, defaultValue, hideLabel }: RoleSelectProps) {
  const t = useTranslations("common.roles");
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium text-slate-700"}>
        {label}
      </label>
      <Select id={id} name="role" defaultValue={defaultValue}>
        {ROLES.map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </Select>
    </div>
  );
}
