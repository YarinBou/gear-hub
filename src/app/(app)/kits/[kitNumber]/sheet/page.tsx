import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { groupLines, lineComplete, WEAPON_ITEM, type ChecklistLine } from "@/lib/kit";
import { getKit, getKitSlots } from "@/lib/queries/kits";
import { formatDate, formatDateTime } from "@/lib/utils";
import { BackLink } from "@/components/layout/back-link";
import { Serial } from "@/components/equipment/serial";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "טופס החתמת ציוד" };


/** Printable soldier sign-out form (טופס החתמה). The app shell is hidden in print. */
export default async function KitSheetPage({ params }: PageProps<"/kits/[kitNumber]/sheet">) {
  await requireUser();
  const kitNumber = Number((await params).kitNumber);
  if (!Number.isInteger(kitNumber) || kitNumber < 1 || kitNumber > (await getKitSlots())) notFound();
  const kit = await getKit(kitNumber);
  if (!kit?.soldier) notFound();
  const weaponLine = kit.lines.find((l) => l.systemKey === WEAPON_ITEM);
  const otherLines = kit.lines.filter((l) => l !== weaponLine);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <BackLink href={`/kits/${kitNumber}`} label={`חזרה לערכה ${kitNumber}`} />
        <PrintButton />
      </div>

      <article className="bg-card rounded-xl border p-6 text-sm print:border-0 print:p-0">
        <header className="mb-4 flex items-start justify-between border-b pb-3">
          <div>
            <h1 className="text-xl font-bold">טופס החתמת ציוד אישי</h1>
            <p className="text-muted-foreground">ערכה מס&apos; {kitNumber}</p>
          </div>
          <p className="text-muted-foreground text-xs">הופק {formatDateTime(new Date())}</p>
        </header>

        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">שם הלוחם</dt>
            <dd className="font-semibold">{kit.soldier.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">מספר אישי</dt>
            <dd className="ltr-text font-semibold">{kit.soldier.personalNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">מחלקה</dt>
            <dd className="font-semibold">{kit.soldier.platoon.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">טלפון</dt>
            <dd className="ltr-text font-semibold">{kit.soldier.phone ?? "—"}</dd>
          </div>
        </dl>

        <section className="mb-4">
          <h2 className="mb-1 font-semibold">נשק אישי ותחמושת</h2>
          <table className="w-full border-collapse">
            <tbody>
              {weaponLine && <SheetRow label={weaponLine.label} value={<Issued yes={lineComplete(weaponLine)} />} />}
              <SheetRow label="סוג נשק" value={kit.rifleType ?? "—"} />
              <SheetRow
                label='צ / מס"ט'
                value={kit.personalWeapon ? <Serial value={kit.personalWeapon.serialNumber} /> : "—"}
              />
              <SheetRow label="מחסניות" value={String(kit.magazineCount)} />
              <SheetRow label="כדורים" value={String(kit.ammoCount)} />
            </tbody>
          </table>
        </section>

        {/* The company's checklist; the personal-weapon line sits in the weapon block above. */}
        {groupLines(otherLines).map((g) => (
          <section key={g.groupName} className="mb-4 break-inside-avoid">
            <h2 className="mb-1 font-semibold">{g.groupName}</h2>
            <table className="w-full border-collapse">
              <tbody>
                {g.lines.map((l) => (
                  <SheetRow key={l.itemId} label={l.label} value={<LineValue line={l} />} />
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {kit.notes && <p className="mb-4">הערות: {kit.notes}</p>}

        <footer className="mt-6 grid grid-cols-2 gap-6 border-t pt-4">
          <div>
            <p className="text-muted-foreground text-xs">חתימת הלוחם</p>
            {kit.signatureData ? (
              // eslint-disable-next-line @next/next/no-img-element -- stored data URL
              <img src={kit.signatureData} alt="חתימת הלוחם" className="h-20 object-contain" />
            ) : (
              <div className="h-20 border-b border-dashed" />
            )}
            <p className="text-xs">{kit.signedAt ? `תאריך: ${formatDate(kit.signedAt)}` : "טרם נחתם"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">המחתים</p>
            <p className="mt-2 font-semibold">{kit.signedBy?.name ?? "—"}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

function Issued({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="text-success flex items-center gap-1 font-medium print:text-black">
      <Check className="size-4" /> נופק
    </span>
  ) : (
    <span className="text-danger flex items-center gap-1 font-medium print:text-black">
      <X className="size-4" /> לא נופק
    </span>
  );
}

function SheetRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b last:border-0">
      <td className="w-1/2 py-1.5">{label}</td>
      <td className="py-1.5">{value}</td>
    </tr>
  );
}

/** A checklist line on paper: ✓ / ✗, plus "5/7" for counted items. */
function LineValue({ line }: { line: ChecklistLine }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Issued yes={lineComplete(line)} />
      {line.targetQuantity != null && (
        <span className="tabular-nums">
          {line.quantity ?? 0}/{line.targetQuantity}
        </span>
      )}
    </span>
  );
}
