"use client";

import { useId, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PlatoonRef } from "@/lib/platoons";
import type { SoldierOption } from "@/lib/queries/soldiers";
import { cn } from "@/lib/utils";

/** Quotes, geresh and dashes don't matter when searching (מ"מ = ממ, 72-20 = 7220). */
const normalize = (s: string) => s.toLowerCase().replace(/["'״׳`\-.]/g, "").trim();

/** Every word typed must appear in the name or personal number. */
function matches(s: SoldierOption, words: string[]) {
  const hay = normalize(`${s.name} ${s.personalNumber ?? ""}`);
  return words.every((w) => hay.includes(w));
}

const MAX_RESULTS = 8;

/**
 * The app-wide soldier picker: a search box (name or personal number) over a native dropdown
 * grouped by platoon. Typing shows matching soldiers to tap; the dropdown narrows too.
 * Feed it `await getSoldierOptions()`.
 *
 *   <SoldierSelect name="assignedSoldierId" options={soldiers} />            // uncontrolled
 *   <SoldierSelect value={id} onValueChange={setId} options={soldiers} />    // controlled
 */
export function SoldierSelect({
  options,
  platoonId,
  placeholder = "בחירת לוחם…",
  allowEmpty = true,
  emptyLabel = "ללא שיוך",
  value,
  defaultValue,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Select>, "children" | "value" | "defaultValue" | "onChange"> & {
  options: SoldierOption[];
  /** Restrict to one platoon (e.g. a מ"מ assigning within their platoon). */
  platoonId?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (soldierId: string) => void;
}) {
  const searchId = useId();
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const [query, setQuery] = useState("");

  const choose = (id: string) => {
    if (value === undefined) setInner(id);
    onValueChange?.(id);
  };

  const pool = platoonId ? options.filter((s) => s.platoon.id === platoonId) : options;
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const found = words.length ? pool.filter((s) => matches(s, words)) : pool;
  // The dropdown narrows with the search, but always keeps the current choice.
  const listed = words.length ? pool.filter((s) => s.id === current || found.includes(s)) : pool;

  const groups: { platoon: PlatoonRef; soldiers: SoldierOption[] }[] = [];
  for (const s of listed) {
    const g = groups.find((x) => x.platoon.id === s.platoon.id);
    if (g) g.soldiers.push(s);
    else groups.push({ platoon: s.platoon, soldiers: [s] });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          id={searchId}
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="חיפוש לפי שם או מספר אישי"
          aria-label="חיפוש לוחם"
          value={query}
          disabled={props.disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the only match instead of submitting the form.
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (words.length && found.length === 1) {
              choose(found[0].id);
              setQuery("");
            }
          }}
          className="ps-9"
        />
      </div>

      {words.length > 0 && (
        <ul aria-label="תוצאות חיפוש" className="bg-card max-h-72 overflow-y-auto rounded-md border">
          {found.length === 0 ? (
            <li className="text-muted-foreground px-3 py-2 text-sm">לא נמצא לוחם</li>
          ) : (
            found.slice(0, MAX_RESULTS).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={cn(
                    "hover:bg-accent flex min-h-11 w-full items-center gap-2 px-3 text-start text-sm",
                    s.id === current && "bg-primary/5 font-medium",
                  )}
                  onClick={() => {
                    choose(s.id);
                    setQuery("");
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {s.name}
                    {s.personalNumber && <span className="text-muted-foreground ms-2 tabular-nums">{s.personalNumber}</span>}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">{s.platoon.name}</span>
                  {s.id === current && <Check className="text-primary size-4 shrink-0" />}
                </button>
              </li>
            ))
          )}
          {found.length > MAX_RESULTS && (
            <li className="text-muted-foreground border-t px-3 py-2 text-xs">
              ועוד {found.length - MAX_RESULTS} — אפשר לחדד את החיפוש או לבחור מהרשימה
            </li>
          )}
        </ul>
      )}

      <Select value={current} onChange={(e) => choose(e.target.value)} {...props}>
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
    </div>
  );
}
