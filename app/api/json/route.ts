import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "app", "data", "dict.json");
    const dictData = await readFile(filePath, "utf8");
    return NextResponse.json(JSON.parse(dictData));
  } catch (error) {
    console.error("Error loading raw dictionary:", error);
    return NextResponse.json({ error: "Failed to load raw dictionary" }, { status: 500 });
  }
}
