import { Label } from "@/components/ui/label";

/** Label + control + hint + Hebrew error message. */
export function Field({
  id,
  label,
  error,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-danger">*</span>}
      </Label>
      {hint && <p className="text-muted-foreground -mt-1 text-xs">{hint}</p>}
      {children}
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}
