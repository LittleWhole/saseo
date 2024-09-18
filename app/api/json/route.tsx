import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Transform } from "node:stream";

export async function GET(req: NextRequest) {
    //const path = __dirname.replace("/.next/server", "") + "/../../data/dict.json";
    const path = __dirname.replace("\\.next\\server", "") + "\\..\\..\\data\\dict.json";
    let dictData = "";

    const jsonStream = new Transform({
        transform(chunk, encoding, callback) {
            dictData += chunk.toString();
            callback();
        },
    });

    await new Promise((resolve, reject) => {
        createReadStream(path)
            .pipe(jsonStream)
            .on("finish", resolve)
            .on("error", reject);
    });

    try {
        const parsedData = JSON.parse(dictData);
        return NextResponse.json(parsedData);
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return NextResponse.json({ error: "Failed to parse JSON" }, { status: 500 });
    }
}