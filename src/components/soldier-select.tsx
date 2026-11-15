import { Select } from "@/components/ui/select";
import type { PlatoonRef } from "@/lib/platoons";
import type { SoldierOption } from "@/lib/queries/soldiers";

/**
 * The app-wide soldier picker. Feed it `await getSoldierOptions()` (cached, roster-wide, sorted by
 * platoon order). Grouped by platoon; works in server and client components alike.
 *
 *   <SoldierSelect name="assignedSoldierId" options={await getSoldierOptions()} />
 */
export function SoldierSelect({
  options,
  platoonId,
  placeholder = "בחירת לוחם…",
  allowEmpty = true,
  emptyLabel = "ללא שיוך",
  ...props
}: Omit<React.ComponentProps<typeof Select>, "children"> & {
  options: SoldierOption[];
  /** Restrict to one platoon (e.g. a מ"מ assigning within their platoon). */
  platoonId?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const groups: { platoon: PlatoonRef; soldiers: SoldierOption[] }[] = [];
  for (const s of options) {
    if (platoonId && s.platoon.id !== platoonId) continue;
    const g = groups.find((x) => x.platoon.id === s.platoon.id);
    if (g) g.soldiers.push(s);
    else groups.push({ platoon: s.platoon, soldiers: [s] });
  }

  return (
    <Select defaultValue="" {...props}>
      <option value="" disabled={!allowEmpty}>
        {allowEmpty ? emptyLabel : placeholder}
      </option>
      {groups.map((g) => (
        <optgroup key={g.platoon.id} label={g.platoon.name}>
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
