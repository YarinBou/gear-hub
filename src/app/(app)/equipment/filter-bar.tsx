"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PlatoonRef } from "@/lib/platoons";
import { cn } from "@/lib/utils";

/** Search + type + platoon filters. Updates the URL (shareable, back-button friendly). */
export function FilterBar({ categories, platoons }: { categories: { id: string; name: string }[]; platoons: PlatoonRef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className={cn("grid gap-2 sm:grid-cols-[1fr_12rem_12rem]", pending && "opacity-70")}>
      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          update("q", String(new FormData(e.currentTarget).get("q") ?? "").trim());
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          name="q"
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder='חיפוש צ / מס"ט, שם לוחם או הערה'
          aria-label='חיפוש בצל"ם'
          className="bg-card ps-9"
          enterKeyHint="search"
        />
      </form>
      <Select
        aria-label="סינון לפי סוג"
        className="bg-card"
        value={params.get("category") ?? ""}
        onChange={(e) => update("category", e.target.value)}
      >
        <option value="">כל הסוגים</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="סינון לפי מחלקה"
        className="bg-card"
        value={params.get("platoon") ?? ""}
        onChange={(e) => update("platoon", e.target.value)}
      >
        <option value="">כל המחלקות</option>
        {platoons.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="NONE">ללא מחלקה</option>
      </Select>
    </div>
  );
}
