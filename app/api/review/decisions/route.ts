import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isReviewAuthorized } from "../auth";

type ReviewDecision = {
  action: "approve" | "reject" | "skip";
  itemId: string;
  entryId?: string;
  entry?: {
    id: string;
    hangul: string;
    hanja: string;
    definitions: Array<{
      text: string;
      pos: string[];
      examples: string[];
      tags: string[];
      sourceIds?: string[];
      confidence?: number;
    }>;
    provenance?: string[];
    confidence?: number;
    reviewStatus?: string;
  };
  note?: string;
};

function isDecision(value: unknown): value is ReviewDecision {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<ReviewDecision>;
  return (
    typeof maybe.itemId === "string" &&
    (maybe.action === "approve" || maybe.action === "reject" || maybe.action === "skip")
  );
}

export async function POST(request: NextRequest) {
  if (!isReviewAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decision = (await request.json()) as unknown;
  if (!isDecision(decision)) {
    return NextResponse.json({ error: "Invalid review decision" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "app", "data", "review-decisions.jsonl");
  await mkdir(path.dirname(filePath), { recursive: true });
  const record = {
    ...decision,
    decidedAt: new Date().toISOString(),
  };
  await appendFile(filePath, `${JSON.stringify(record)}\n`);

  return NextResponse.json({ ok: true, decision: record });
}
