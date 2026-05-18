"use client";

import { Github } from "lucide-react";

const BUG_REPORT_URL = "https://github.com/LittleWhole/saseo/issues/new";

export function ReportBugLink({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <a
      href={BUG_REPORT_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Report a bug on GitHub"
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border border-stone-700/80 bg-stone-950/70 px-4 py-2.5 text-sm font-semibold text-stone-100 shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-colors hover:border-emerald-300/45 hover:bg-emerald-300/10 hover:text-emerald-100 ${className}`}
    >
      <Github className="h-4 w-4" aria-hidden="true" />
      <span>Report a bug</span>
    </a>
  );
}
