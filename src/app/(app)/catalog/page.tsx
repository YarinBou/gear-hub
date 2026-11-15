import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { CATALOG_DOMAIN_LABELS } from "@/lib/constants";
import { CATALOG_DOMAINS, getCatalogCounts, listCatalog } from "@/lib/queries/catalog";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { CatalogDomain } from "@/generated/prisma/enums";
import { AddCategoryForm, CategoryRow } from "./category-forms";

export const metadata: Metadata = { title: "קטלוג ציוד" };

const DOMAIN_COPY: Record<CatalogDomain, { description: string; add: string; usage: string }> = {
  EQUIPMENT: {
    description: 'סוגי פריטים ממוספרים: נשק, אופטיקה, אמצעי ראיית לילה, רחפנים ואמצעי קשר.',
    add: 'הוספת סוג צל"ם',
    usage: "פריטים",
  },
  AMMUNITION: {
    description: "סוגי תחמושת, קטגוריה (נפיצה / אלפ\"ה / רגילה) וסף מינימום להתראת מלאי נמוך.",
    add: "הוספת סוג תחמושת",
    usage: "מיקומי מלאי",
  },
  STORAGE: {
    description: 'פריטי ציוד פלוגתי בימ"ח. לכל סוג נפתחת שורת תקן / מצאי במודול הבימ"ח.',
    add: 'הוספת פריט בימ"ח',
    usage: "שורות מלאי",
  },
};

export default async function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  await requireAdmin();
  const raw = (await searchParams).domain;
  const domain: CatalogDomain = CATALOG_DOMAINS.includes(raw as CatalogDomain) ? (raw as CatalogDomain) : "EQUIPMENT";
  const [rows, counts] = await Promise.all([listCatalog(domain), getCatalogCounts()]);
  const copy = DOMAIN_COPY[domain];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">קטלוג ציוד</h1>
        <p className="text-muted-foreground text-sm">הסוגים המוגדרים כאן מופיעים ברשימות הבחירה בכל המערכת.</p>
      </div>

      <nav aria-label="תחום" className="bg-muted flex rounded-lg p-1">
        {CATALOG_DOMAINS.map((d) => (
          <Link
            key={d}
            href={`/catalog?domain=${d}`}
            aria-current={d === domain ? "page" : undefined}
            className={cn(
              "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
              d === domain ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {CATALOG_DOMAIN_LABELS[d]}
            <span className="text-muted-foreground text-xs tabular-nums">{counts[d]}</span>
          </Link>
        ))}
      </nav>

      <p className="text-muted-foreground text-sm">
        {copy.description}
        {domain === "EQUIPMENT" && (
          <>
            {" "}
            פריטים שבאים יחד (נשק + כוונת, נגב + רכיבים) מגדירים ב
            <Link href="/catalog/sets" className="text-primary font-medium hover:underline">
              מארזים
            </Link>
            .
          </>
        )}
      </p>

      {/* key: reset the add form when switching tabs */}
      <AddCategoryForm key={domain} domain={domain} label={copy.add} />

      {rows.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="text-muted-foreground">אין עדיין סוגים בתחום זה</p>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {rows.map((c) => (
              <CategoryRow key={c.id} category={c} domain={domain} usageLabel={copy.usage} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
