import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type HanjaEntry = {
  hanja: string;
  hangul: string;
};

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "app", "data", "hanja.txt");
    const fileBuffer = await readFile(filePath, "utf8");
    const dict: HanjaEntry[] = fileBuffer
      .split("\n")
      .map((line) => {
        const [hangul, hanja] = line.split(":");
        return { hanja, hangul };
      })
      .filter((entry) => entry.hangul && entry.hanja);

    return NextResponse.json(dict);
  } catch (error) {
    console.error("Error loading Hanja map:", error);
    return NextResponse.json({ error: "Failed to load Hanja map" }, { status: 500 });
  }
}
