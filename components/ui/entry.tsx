"use client";

import { Ruby } from "./ruby";
import { AlternateForm, Definition } from "@/app/search/helpers";
import { Table2, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

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

type ConjugationKind = "Verb" | "Adjective";

type ConjugationRow = {
    section: string;
    label: string;
    mixed: string;
    note?: string;
};

type ConjugationTarget = {
    kind: ConjugationKind;
    mixed: string;
    hangul: string;
};

function hasFinalConsonant(text: string) {
    const last = Array.from(text).reverse().find((char) => /[\uAC00-\uD7AF]/.test(char));
    if (!last) return false;
    return (last.charCodeAt(0) - 0xac00) % 28 !== 0;
}

function lastVowelIsAOrO(text: string) {
    const last = Array.from(text).reverse().find((char) => /[\uAC00-\uD7AF]/.test(char));
    if (!last) return false;
    const medialIndex = Math.floor(((last.charCodeAt(0) - 0xac00) % 588) / 28);
    return medialIndex === 0 || medialIndex === 8;
}

function appendFinalConsonant(stem: string, finalIndex: number) {
    const chars = Array.from(stem);
    const last = chars[chars.length - 1];
    if (!last || !/[\uAC00-\uD7AF]/.test(last) || hasFinalConsonant(last)) return stem;
    chars[chars.length - 1] = String.fromCharCode(last.charCodeAt(0) + finalIndex);
    return chars.join("");
}

function formalForm(stem: string) {
    return hasFinalConsonant(stem) ? `${stem}습니다` : `${appendFinalConsonant(stem, 17)}니다`;
}

function politeEnding(stem: string) {
    return lastVowelIsAOrO(stem) ? "아요" : "어요";
}

function pastEnding(stem: string) {
    return lastVowelIsAOrO(stem) ? "았다" : "었다";
}

function buildConjugationRows(target: ConjugationTarget): ConjugationRow[] {
    const isHada = target.hangul.endsWith("하다") && target.mixed.endsWith("하다");
    const hangulStem = isHada ? target.hangul.slice(0, -2) : target.hangul.slice(0, -1);
    const mixedStem = isHada ? target.mixed.slice(0, -2) : target.mixed.slice(0, -1);

    if (isHada) {
        if (target.kind === "Verb") {
            return [
                { section: "Sentence-final forms", label: "Indicative, plain", mixed: `${mixedStem}한다` },
                { section: "Sentence-final forms", label: "Indicative, informal", mixed: `${mixedStem}해` },
                { section: "Sentence-final forms", label: "Indicative, polite", mixed: `${mixedStem}해요` },
                { section: "Sentence-final forms", label: "Indicative, formal", mixed: `${mixedStem}합니다` },
                { section: "Sentence-final forms", label: "Past, plain", mixed: `${mixedStem}했다` },
                { section: "Sentence-final forms", label: "Past, polite", mixed: `${mixedStem}했어요` },
                { section: "Sentence-final forms", label: "Interrogative, formal", mixed: `${mixedStem}합니까` },
                { section: "Sentence-final forms", label: "Imperative", mixed: `${mixedStem}해라` },
                { section: "Sentence-final forms", label: "Hortative", mixed: `${mixedStem}하자` },
                { section: "Connective forms", label: "Cause/reason", mixed: `${mixedStem}해서` },
                { section: "Connective forms", label: "Conjunction", mixed: `${mixedStem}하고` },
                { section: "Connective forms", label: "Condition", mixed: `${mixedStem}하면` },
                { section: "Connective forms", label: "Contrast", mixed: `${mixedStem}하지만` },
                { section: "Noun and determiner forms", label: "Verbal noun", mixed: `${mixedStem}함` },
                { section: "Noun and determiner forms", label: "Gerund", mixed: `${mixedStem}하기` },
                { section: "Noun and determiner forms", label: "Present determiner", mixed: `${mixedStem}하는` },
                { section: "Noun and determiner forms", label: "Future determiner", mixed: `${mixedStem}할` },
            ];
        }

        return [
            { section: "Sentence-final forms", label: "Indicative, plain", mixed: target.mixed },
            { section: "Sentence-final forms", label: "Indicative, informal", mixed: `${mixedStem}해` },
            { section: "Sentence-final forms", label: "Indicative, polite", mixed: `${mixedStem}해요` },
            { section: "Sentence-final forms", label: "Indicative, formal", mixed: `${mixedStem}합니다` },
            { section: "Sentence-final forms", label: "Past, plain", mixed: `${mixedStem}했다` },
            { section: "Sentence-final forms", label: "Past, polite", mixed: `${mixedStem}했어요` },
            { section: "Sentence-final forms", label: "Interrogative, formal", mixed: `${mixedStem}합니까` },
            { section: "Connective forms", label: "Cause/reason", mixed: `${mixedStem}해서` },
            { section: "Connective forms", label: "Conjunction", mixed: `${mixedStem}하고` },
            { section: "Connective forms", label: "Condition", mixed: `${mixedStem}하면` },
            { section: "Connective forms", label: "Contrast", mixed: `${mixedStem}하지만` },
            { section: "Connective forms", label: "Adverbial", mixed: `${mixedStem}하게` },
            { section: "Noun and determiner forms", label: "Verbal noun", mixed: `${mixedStem}함` },
            { section: "Noun and determiner forms", label: "Gerund", mixed: `${mixedStem}하기` },
            { section: "Noun and determiner forms", label: "Present determiner", mixed: `${mixedStem}한` },
            { section: "Noun and determiner forms", label: "Future determiner", mixed: `${mixedStem}할` },
        ];
    }

    const rows: ConjugationRow[] = [
        { section: "Sentence-final forms", label: "Indicative, informal", mixed: `${mixedStem}${politeEnding(hangulStem)}` },
        { section: "Sentence-final forms", label: "Indicative, formal", mixed: formalForm(mixedStem) },
        { section: "Sentence-final forms", label: "Past, plain", mixed: `${mixedStem}${pastEnding(hangulStem)}` },
        { section: "Connective forms", label: "Conjunction", mixed: `${mixedStem}고` },
        { section: "Connective forms", label: "Condition", mixed: `${mixedStem}면` },
    ];

    if (target.kind === "Verb") {
        rows.unshift({
            label: "Plain present",
            section: "Sentence-final forms",
            mixed: hasFinalConsonant(hangulStem) ? `${mixedStem}는다` : `${appendFinalConsonant(mixedStem, 4)}다`,
        });
        rows.push({ section: "Noun and determiner forms", label: "Present determiner", mixed: `${mixedStem}는` });
    } else {
        rows.push({
            section: "Noun and determiner forms",
            label: "Attributive",
            mixed: hasFinalConsonant(hangulStem) ? `${mixedStem}은` : appendFinalConsonant(mixedStem, 4),
        });
        rows.push({ section: "Connective forms", label: "Adverbial", mixed: `${mixedStem}게` });
    }

    return rows.map((row) => ({ ...row, note: "Regular fallback" }));
}

function conjugationTargetForDefinition(definition: Definition, hanja: string, hangul: string): ConjugationTarget | null {
    const pos = new Set(definition.pos);
    const tags = new Set(definition.tags);
    const kind = pos.has("Verb") || tags.has("hada-verb")
        ? "Verb"
        : pos.has("Adjective") || tags.has("hada-adjective")
          ? "Adjective"
          : null;

    if (!kind) return null;
    const mixed = definition.formOf?.form ?? hanja;
    const reading = definition.formOf?.reading ?? hangul;
    if (!mixed.endsWith("다") || !reading.endsWith("다")) return null;
    return { kind, mixed, hangul: reading };
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
    const [conjugationTarget, setConjugationTarget] = useState<ConjugationTarget | null>(null);
    const conjugationRows = useMemo(
        () => (conjugationTarget ? buildConjugationRows(conjugationTarget) : []),
        [conjugationTarget],
    );
    const cleanedAlternates: AlternateForm[] = [
        ...alternateForms,
        ...alternateHanja
            .filter((alternate) => alternate !== hanja)
            .map((alternate) => ({ form: alternate })),
    ];

    return (
        <article className="group grid w-full gap-7 rounded-xl border border-stone-800/90 bg-[#171310]/95 p-5 shadow-[0_16px_48px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.03] transition-colors hover:border-stone-700 md:grid-cols-[17rem_1fr] md:p-7">
            <div className="min-w-0">
                <div className="headword-script break-words text-4xl font-medium leading-tight text-stone-50 md:text-5xl">
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
                                {conjugationTargetForDefinition(definition, hanja, hangul) && (
                                    <button
                                        type="button"
                                        onClick={() => setConjugationTarget(conjugationTargetForDefinition(definition, hanja, hangul))}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-stone-950/40 px-2 py-0.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-300/10"
                                    >
                                        <Table2 className="h-3.5 w-3.5" />
                                        conjugate
                                    </button>
                                )}
                            </div>
                            <div>
                                {definition.formOf && (
                                    <span className="mr-2 inline-flex items-center rounded-full bg-emerald-300/12 px-2.5 py-1 align-middle text-sm font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                                        as {definition.formOf.form}
                                    </span>
                                )}
                                <span>{definition.text}</span>
                            </div>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
            {conjugationTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Conjugation table for ${conjugationTarget.mixed}`}
                    onClick={() => setConjugationTarget(null)}
                >
                    <div
                        className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-xl border border-stone-700 bg-[#171310] shadow-2xl ring-1 ring-white/10"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-stone-800 px-5 py-4">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                                    Conjugation
                                </div>
                                <div className="mt-1 headword-script text-3xl font-semibold text-stone-50">
                                    {conjugationTarget.mixed}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setConjugationTarget(null)}
                                className="rounded-full border border-stone-700 bg-stone-950/50 p-2 text-stone-300 transition-colors hover:bg-stone-800 hover:text-stone-50"
                                aria-label="Close conjugation table"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="max-h-[65vh] overflow-auto p-5">
                            <table className="w-full border-separate border-spacing-0 overflow-hidden text-left text-sm">
                                <thead className="text-xs uppercase tracking-[0.16em] text-stone-500">
                                    <tr>
                                        <th className="border-b border-stone-800 pb-2 font-semibold">Form</th>
                                        <th className="border-b border-stone-800 pb-2 font-semibold">Conjugation</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {conjugationRows.map((row, rowIndex) => {
                                        const startsSection = rowIndex === 0 || conjugationRows[rowIndex - 1].section !== row.section;
                                        return (
                                            <Fragment key={`${row.section}-${row.label}-${row.mixed}`}>
                                                {startsSection && (
                                                    <tr key={`${row.section}-heading`}>
                                                        <th
                                                            colSpan={2}
                                                            className="bg-emerald-300/10 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-emerald-200"
                                                        >
                                                            {row.section}
                                                        </th>
                                                    </tr>
                                                )}
                                                <tr key={`${row.section}-${row.label}-${row.mixed}`} className="align-top">
                                                    <td className="w-2/5 border-b border-stone-800/70 py-3 pr-3 text-stone-400">
                                                        {row.label}
                                                        {row.note && (
                                                            <div className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-stone-600">
                                                                {row.note}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="headword-script border-b border-stone-800/70 py-3 text-lg text-stone-100">
                                                        {row.mixed}
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}
