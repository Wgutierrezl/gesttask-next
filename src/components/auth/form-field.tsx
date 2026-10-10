interface FormFieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  errors?: string[];
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  defaultValue?: string;
  /** Renders a textarea instead of an input. */
  multiline?: boolean;
}

/** A labelled input whose server-side errors are announced and linked to it. */
export function FormField({ label, name, type = "text", autoComplete, errors, minLength, maxLength, required = true, defaultValue, multiline }: FormFieldProps) {
  const errorId = `${name}-error`;
  const shared = {
    id: name,
    name,
    autoComplete,
    maxLength,
    defaultValue,
    required,
    "aria-invalid": errors ? true : undefined,
    "aria-describedby": errors ? errorId : undefined,
    className: "rounded border border-gray-300 px-3 py-2 text-sm",
  } as const;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type={type} minLength={minLength} />}
      {errors ? (
        <p id={errorId} className="text-sm text-red-700">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
