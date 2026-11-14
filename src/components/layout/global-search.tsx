import Form from "next/form";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Persistent search: serial number, soldier name / personal number, kit number. */
export function GlobalSearch({ defaultValue }: { defaultValue?: string }) {
  return (
    <Form action="/search" role="search" className="relative w-full">
      <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
      <Input
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder='חיפוש צ / מס"ט, לוחם או מספר ערכה…'
        aria-label="חיפוש גלובלי"
        autoComplete="off"
        enterKeyHint="search"
        className="bg-background ps-9"
      />
    </Form>
  );
}
