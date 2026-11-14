import { Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Temporary page body for modules that are scaffolded but not built yet. */
export function ModulePlaceholder({ title, description, features }: { title: string; description: string; features: string[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="text-warning-foreground dark:text-warning size-5" />
            המודול בפיתוח
          </CardTitle>
          <CardDescription>היכולות המתוכננות:</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
