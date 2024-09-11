import { HanjaEntry } from "@/app/search/helpers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";


export async function GET(req: NextRequest) {
  const path = __dirname.replace("/.next/server", "") + "/../../data/hanja.txt"; //.next/server is the path to the build folder that is created when you run next command
  const fileBuffer = await fs.readFile(path);
  const dict: HanjaEntry[] = [];
  fileBuffer.toString().split("\n").forEach((line: string) => {
    const [hangul, hanja] = line.split(":");
    dict.push({
      hanja,
      hangul
    });
  });
  return NextResponse.json(dict);
}