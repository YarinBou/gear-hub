import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PLATOON_LABELS, TOTAL_KITS } from "@/lib/constants";
import { KIT_GROUP_LABELS, KIT_ITEMS, type KitGroup } from "@/lib/kit";
import { getKit } from "@/lib/queries/kits";
import { formatDate, formatDateTime } from "@/lib/utils";
import { BackLink } from "@/components/layout/back-link";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "טופס החתמת ציוד" };

// The "weapon" checklist line is shown inside the weapon block, not as its own group.
const GROUPS: KitGroup[] = ["accessories", "personal"];

/** Printable soldier sign-out form (טופס החתמה). The app shell is hidden in print. */
export default async function KitSheetPage({ params }: PageProps<"/kits/[kitNumber]/sheet">) {
  await requireUser();
  const kitNumber = Number((await params).kitNumber);
  if (!Number.isInteger(kitNumber) || kitNumber < 1 || kitNumber > TOTAL_KITS) notFound();
  const kit = await getKit(kitNumber);
  if (!kit?.soldier) notFound();

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
            <dd className="font-semibold">{PLATOON_LABELS[kit.soldier.platoon]}</dd>
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
              <SheetRow label="נשק אישי" value={<Issued yes={kit.weaponIssued} />} />
              <SheetRow label="סוג נשק" value={kit.rifleType ?? "—"} />
              <SheetRow
                label='צ / מס"ט'
                value={kit.personalWeapon ? <span className="ltr-text font-mono">{kit.personalWeapon.serialNumber}</span> : "—"}
              />
              <SheetRow label="מחסניות" value={String(kit.magazineCount)} />
              <SheetRow label="כדורים" value={String(kit.ammoCount)} />
            </tbody>
          </table>
        </section>

        {GROUPS.map((g) => (
          <section key={g} className="mb-4 break-inside-avoid">
            <h2 className="mb-1 font-semibold">{KIT_GROUP_LABELS[g]}</h2>
            <table className="w-full border-collapse">
              <tbody>
                {KIT_ITEMS.filter((i) => i.group === g).map((i) => (
                  <SheetRow key={i.key} label={i.label} value={<Issued yes={kit[i.key]} />} />
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
