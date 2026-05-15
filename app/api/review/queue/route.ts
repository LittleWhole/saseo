import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isReviewAuthorized } from "../auth";

export async function GET(request: NextRequest) {
  if (!isReviewAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const filePath = path.join(process.cwd(), "app", "data", "generated", "review-queue.json");
    const raw = await readFile(filePath, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch (error) {
    console.error("Failed to load review queue:", error);
    return NextResponse.json(
      { error: "Review queue is missing or invalid. Run npm run lexicon:build.", items: [] },
      { status: 500 },
    );
  }
}
