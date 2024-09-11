import { Ruby } from "./ruby";
import { POS } from "../../app/types";

function formatRuby(hanjaSplit: string[], hangulSplit: string[]): JSX.Element[] {
    const rubyArray = [];
    for (var i = 0; i < hanjaSplit.length; i++) {
        if (hanjaSplit[i] === hangulSplit[i]) {
            hangulSplit[i] = "";
        }
        rubyArray.push(<Ruby text={hanjaSplit[i]} ruby={hangulSplit[i]} />);
    }
    return rubyArray;
}

export function Entry({ hanja, hangul, definitions }: Readonly<{ hanja: string; hangul: string; definitions: Definition[] }>) {
    const [hanjaSplit, hangulSplit] = [hanja.split(""), hangul.split("")];

    return (
        <div className="flex flex-row p-8 gap-x-20 bg-gray-800 rounded-lg w-full">
            <div className="flex items-center space-x-2">
                <div className="text-4xl">
                    {formatRuby(hanjaSplit, hangulSplit)}
                    </div>
            </div>
            <div className="flex flex-col space-y-1">
                <ol className="list-decimal list-inside">
                    {definitions.map((definition, index) => ( <div key={index}>
                        <p className="text-sm font-bold text-slate-400">{definition.pos.join(", ")}</p>
                        <li className="text-lg">{definitions[index].text}</li>
                        </div>
                    ))}
                </ol>
            </div>
        </div>
    );
}