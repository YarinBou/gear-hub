import { Suspense } from "react";
import type { Metadata } from "next";
import { ShieldHalf } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "התחברות" };

async function LoginFormWithRedirect({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const next = (await searchParams).next;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center text-center">
          <ShieldHalf className="text-primary mb-2 size-12" />
          <CardTitle className="text-2xl">Gear-Hub</CardTitle>
          <CardDescription>מערכת לוגיסטיקה פלוגתית</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<LoginForm />}>
            <LoginFormWithRedirect searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
