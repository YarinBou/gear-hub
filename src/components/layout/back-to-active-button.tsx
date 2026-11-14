"use client";

import { useTransition } from "react";
import { viewDeployment } from "@/app/(app)/deployments/actions";
import { Button } from "@/components/ui/button";

export function BackToActiveButton() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => viewDeployment(null))}>
      חזרה להפעלה הנוכחית
    </Button>
  );
}
