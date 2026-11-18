"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Backpack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { assignKit } from "@/app/(app)/kits/actions";

/**
 * Issue a kit from the soldier's page: pick one of the free kit numbers, assign it, then continue
 * on the kit's page (checklist, weapon, signature).
 */
export function IssueKitForm({ soldierId, freeKits }: { soldierId: string; freeKits: number[] }) {
  const router = useRouter();
  const [kitNumber, setKitNumber] = useState(String(freeKits[0] ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!freeKits.length) return <p className="text-muted-foreground text-sm">אין ערכות פנויות בהפעלה.</p>;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(kitNumber);
        if (!n) return;
        setError(null);
        start(async () => {
          const fd = new FormData();
          fd.set("soldierId", soldierId);
          const res = await assignKit(n, undefined, fd);
          if (res?.ok) router.push(`/kits/${n}`);
          else setError(res?.error ?? "ההנפקה נכשלה");
        });
      }}
    >
      <label htmlFor="issue-kit" className="text-sm font-medium">
        הנפקת ערכה ({freeKits.length} פנויות)
      </label>
      <div className="flex gap-2">
        <div className="w-32 shrink-0">
          <Select id="issue-kit" value={kitNumber} onChange={(e) => setKitNumber(e.target.value)}>
            {freeKits.map((n) => (
              <option key={n} value={n}>
                ערכה {n}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={pending} className="flex-1">
          <Backpack />
          {pending ? "מנפיק…" : "הנפקה"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
