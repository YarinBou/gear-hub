import { Select } from "@/components/ui/select";
import { PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import type { SoldierOption } from "@/lib/queries/soldiers";
import type { Platoon } from "@/generated/prisma/enums";

/**
 * The app-wide soldier picker. Feed it `await getSoldierOptions()` (cached, roster-wide).
 * Grouped by platoon; works in server and client components alike.
 *
 *   <SoldierSelect name="assignedSoldierId" options={await getSoldierOptions()} />
 */
export function SoldierSelect({
  options,
  platoon,
  placeholder = "בחירת לוחם…",
  allowEmpty = true,
  emptyLabel = "ללא שיוך",
  ...props
}: Omit<React.ComponentProps<typeof Select>, "children"> & {
  options: SoldierOption[];
  /** Restrict to one platoon (e.g. a מ"מ assigning within their platoon). */
  platoon?: Platoon;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const groups = (platoon ? [platoon] : PLATOONS)
    .map((p) => ({ platoon: p, soldiers: options.filter((o) => o.platoon === p) }))
    .filter((g) => g.soldiers.length > 0);

  return (
    <Select defaultValue="" {...props}>
      <option value="" disabled={!allowEmpty}>
        {allowEmpty ? emptyLabel : placeholder}
      </option>
      {groups.map((g) => (
        <optgroup key={g.platoon} label={PLATOON_LABELS[g.platoon]}>
          {g.soldiers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.personalNumber ? ` (${s.personalNumber})` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
