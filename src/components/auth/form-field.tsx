interface FormFieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  errors?: string[];
  minLength?: number;
}

/** A labelled input whose server-side errors are announced and linked to it. */
export function FormField({ label, name, type = "text", autoComplete, errors, minLength }: FormFieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      {errors ? (
        <p id={errorId} className="text-sm text-red-700">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
