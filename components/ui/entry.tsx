import { Ruby } from "./ruby";
import { POS } from "../types";

export function Entry({ hanja, hangul, definitions }: Readonly<{ hanja: string; hangul: string; definitions: [{ pos: POS[], text: string, examples: string[] }] }>) {
    return (
        <div className="flex flex-row p-8 gap-x-40 bg-gray-800 rounded-lg w-full">
            <div className="flex items-center space-x-2">
                <div className="text-4xl"><Ruby text={hanja} ruby={hangul} /></div>
            </div>
            <div className="flex flex-col space-y-1">
                <ol className="list-decimal list-inside">
                    {definitions.map((definition, index) => ( <div key={index}>
                        <p className="text-sm font-bold text-slate-400">{definition.pos.join(", ")}</p>
                        <li>{definitions[index].text}</li>
                        </div>
                    ))}
                </ol>
            </div>
        </div>
    );
}