"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Vercel Web Analytics (page views) and Speed Insights (performance). Both send page URLs to
// Vercel, so query strings and fragments are dropped first: /search?q=… can hold a soldier's
// name or personal number, and filters can hold names too. Paths are kept (they only carry IDs).

function stripQuery<T extends { url: string }>(event: T): T {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}

export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={stripQuery} />
      <SpeedInsights beforeSend={stripQuery} />
    </>
  );
}
