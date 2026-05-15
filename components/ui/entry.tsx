import { Ruby } from "./ruby";
import { AlternateForm, Definition } from "@/app/search/helpers";

function isHanja(text: string) {
    return /[\u4E00-\u9FFF]/.test(text);
}

function isMixedScript(text: string) {
    return /[\uAC00-\uD7AF]/.test(text) && isHanja(text);
}

function renderMixedScriptHeadword(form: string, reading: string) {
    const readingChars = Array.from(reading.replace(/\s+/g, ""));
    let readingIndex = 0;
    const nodes = [];
    let index = 0;

    while (index < form.length) {
        const char = form[index];
        if (/[\uAC00-\uD7AF]/.test(char)) {
            nodes.push(<span key={`h-${index}`}>{char}</span>);
            readingIndex += 1;
            index += 1;
            continue;
        }

        if (/[\u4E00-\u9FFF]/.test(char)) {
            let hanjaRun = "";
            const start = index;
            while (index < form.length && /[\u4E00-\u9FFF]/.test(form[index])) {
                hanjaRun += form[index];
                index += 1;
            }
            const ruby = readingChars.slice(readingIndex, readingIndex + hanjaRun.length);
            readingIndex += hanjaRun.length;
            nodes.push(
                ...Array.from(hanjaRun).map((hanjaChar, offset) => (
                    <Ruby
                        key={`x-${start}-${offset}`}
                        text={hanjaChar}
                        ruby={ruby[offset] ?? ""}
                    />
                )),
            );
            continue;
        }

        nodes.push(<span key={`o-${index}`}>{char}</span>);
        index += 1;
    }

    return <>{nodes}</>;
}

function renderHeadword(hanja: string, hangul: string) {
    const compactHangul = hangul.replace(/\s+/g, "");
    const compactHanja = hanja.replace(/\s+/g, "");
    const hangulChars = Array.from(compactHangul);
    const hanjaChars = Array.from(compactHanja);

    if (!isHanja(compactHanja) || compactHanja === compactHangul) {
        return <span>{hangul}</span>;
    }

    if (isMixedScript(compactHanja)) {
        return renderMixedScriptHeadword(hanja, hangul);
    }

    if (hanjaChars.length !== hangulChars.length) {
        return <span>{hanja}</span>;
    }

    return (
        <>
            {hanjaChars.map((char, index) => (
                <Ruby key={`${char}-${index}`} text={char} ruby={hangulChars[index] ?? ""} />
            ))}
        </>
    );
}

export function Entry({
    hanja,
    hangul,
    alternateHanja = [],
    alternateForms = [],
    definitions,
}: Readonly<{
    hanja: string;
    hangul: string;
    alternateHanja?: string[];
    alternateForms?: AlternateForm[];
    definitions: Definition[];
    confidence?: number;
    reviewStatus?: string;
}>) {
    const cleanedAlternates: AlternateForm[] = [
        ...alternateForms,
        ...alternateHanja
            .filter((alternate) => alternate !== hanja)
            .map((alternate) => ({ form: alternate })),
    ];

    return (
        <article className="group grid w-full gap-7 rounded-xl border border-stone-800/90 bg-[#171310]/95 p-5 shadow-[0_16px_48px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.03] transition-colors hover:border-stone-700 md:grid-cols-[17rem_1fr] md:p-7">
            <div className="min-w-0">
                <div className="break-words text-4xl font-medium leading-tight text-stone-50 md:text-5xl">
                    {renderHeadword(hanja, hangul)}
                </div>
                {cleanedAlternates.length > 0 && (
                    <div className="mt-6">
                        <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                            Other forms
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {cleanedAlternates.map((alternate) => (
                                <span
                                    key={`${alternate.form}-${alternate.reading ?? ""}-${alternate.label ?? ""}`}
                                    className="rounded-lg border border-emerald-300/20 bg-emerald-950/20 px-3.5 py-2.5 text-stone-100 shadow-sm ring-1 ring-white/[0.03]"
                                >
                                    <span className="text-2xl font-medium leading-none">{alternate.form}</span>
                                    {alternate.reading && alternate.reading !== alternate.form && (
                                        <span className="ml-2 align-baseline text-lg text-stone-300">
                                            {alternate.reading}
                                        </span>
                                    )}
                                    {alternate.label && (
                                        <span className="ml-2 rounded-full bg-emerald-300/15 px-2 py-0.5 align-middle text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                                            {alternate.label}
                                        </span>
                                    )}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div className="min-w-0">
                <ol className="space-y-5">
                    {definitions.map((definition, index) => (
                        <li key={`${definition.text}-${index}`} className="grid grid-cols-[2rem_1fr] gap-3 text-lg leading-relaxed text-stone-100">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-700 bg-stone-950/60 text-sm font-semibold text-stone-400">
                                {index + 1}
                            </div>
                            <div>
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-400">
                                <span>{definition.pos.join(", ")}</span>
                                {definition.tags.length > 0 && (
                                    definition.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-xs font-medium text-emerald-200"
                                        >
                                            {tag}
                                        </span>
                                    ))
                                )}
                            </div>
                            <div>{definition.text}</div>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </article>
    );
}
