"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReportDashboard } from "@/components/ReportDashboard";
import Link from "next/link";
import { assetUrl } from "@/lib/paths";

function ReportPageInner() {
  const params = useSearchParams();
  const reportId = params.get("id");

  if (!reportId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-slate-300">Missing report id.</p>
        <Link href={assetUrl("/")} className="mt-4 inline-block text-accent">
          Back home
        </Link>
      </div>
    );
  }

  return <ReportDashboard reportId={reportId} />;
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-20 text-center text-slate-400">
          Loading report…
        </div>
      }
    >
      <ReportPageInner />
    </Suspense>
  );
}
