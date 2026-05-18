"use client";

import { Ruby } from "./ruby";
import { AlternateForm, Definition, ProficiencyBadge, SenseExample } from "@/app/search/helpers";
import { Table2, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

function isHanja(text: string) {
    return /[\u4E00-\u9FFF]/.test(text);
}

function hasKoreanScript(text: string) {
    return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF]/.test(text);
}

function isReadingUnit(text: string) {
    return /[\uAC00-\uD7AF0-9]/.test(text);
}

function renderStructuredHeadword(form: string, reading: string) {
    const readingChars = Array.from(reading).filter(isReadingUnit);
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

        if (/[0-9]/.test(char)) {
            nodes.push(<span key={`d-${index}`}>{char}</span>);
            if (readingChars[readingIndex] === char) readingIndex += 1;
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
    if (!isHanja(hanja) || hanja === hangul) {
        return <span>{hangul}</span>;
    }

    return renderStructuredHeadword(hanja, hangul);
}

function searchHref(form: AlternateForm) {
    return `/search?q=${encodeURIComponent(form.reading ?? form.form)}`;
}

function searchHrefForText(text: string) {
    return `/search?q=${encodeURIComponent(text.trim())}`;
}

const KOREAN_TEXT_PATTERN = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF](?:[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF0-9ㆍ·・-]*[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF0-9])?/g;

function readingUnitCountForDisplay(text: string) {
    return Array.from(text).filter((char) => isReadingUnit(char) || isHanja(char)).length;
}

function renderSearchLinkedText(text: string, reading?: string) {
    const nodes: ReactNode[] = [];
    const readingChars = reading ? Array.from(reading).filter(isReadingUnit) : [];
    let readingIndex = 0;
    KOREAN_TEXT_PATTERN.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = KOREAN_TEXT_PATTERN.exec(text)) !== null) {
        const value = match[0];
        if (match.index > lastIndex) {
            const skipped = text.slice(lastIndex, match.index);
            nodes.push(skipped);
            if (reading) readingIndex += readingUnitCountForDisplay(skipped);
        }

        const readingSliceLength = reading ? readingUnitCountForDisplay(value) : 0;
        const readingSlice = readingChars.slice(readingIndex, readingIndex + readingSliceLength).join("");
        if (reading) readingIndex += readingSliceLength;

        nodes.push(
            <a
                key={`${value}-${match.index}`}
                href={searchHrefForText(readingSlice || value)}
                className="korean-text rounded-sm text-emerald-200 underline decoration-emerald-300/35 underline-offset-4 transition-colors hover:text-emerald-100 hover:decoration-emerald-200"
            >
                {readingSlice && isHanja(value) ? renderStructuredHeadword(value, readingSlice) : value}
            </a>,
        );
        lastIndex = match.index + value.length;
    }

    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }

    return nodes.length ? nodes : text;
}

function formatProficiencyLabel(label: string) {
    return label.replace(/^TOPIK\b/, "Topik");
}

function renderExample(example: SenseExample, index: number) {
    const korean = example.mixedScript ?? example.korean;

    return (
        <div key={`${example.korean}-${example.english ?? ""}-${index}`} className="border-l border-emerald-300/35 pl-4">
            <div className="korean-text text-lg leading-8 text-stone-200">
                {renderSearchLinkedText(korean, example.mixedScript ? example.korean : undefined)}
            </div>
            {example.english && (
                <div className="mt-0.5 text-base leading-7 text-stone-400">
                    {example.english}
                </div>
            )}
        </div>
    );
}

type ConjugationKind = "Verb" | "Adjective";

type ConjugationCell = {
    form: string;
    note?: string;
};

type RegisterCells = [ConjugationCell, ConjugationCell, ConjugationCell, ConjugationCell];

type ConjugationMatrixRow = {
    label: string;
    cells: RegisterCells;
};

type ConjugationMatrixSection = {
    title: string;
    note?: string;
    rows: ConjugationMatrixRow[];
};

type ConjugationListForm = {
    label: string;
    value: string;
};

type ConjugationListItem = {
    label: string;
    forms: ConjugationListForm[];
    note?: string;
};

type ConjugationListSection = {
    title: string;
    note?: string;
    items: ConjugationListItem[];
};

type ConjugationListTableRow = {
    itemLabel: string;
    form: string;
    note?: string;
};

type ConjugationTable = {
    matrixSections: ConjugationMatrixSection[];
    listSections: ConjugationListSection[];
};

type ConjugationTarget = {
    kind: ConjugationKind;
    mixed: string;
    hangul: string;
};

const REGISTER_COLUMNS = [
    { label: "Formal non-polite", korean: "해라체" },
    { label: "Informal non-polite", korean: "해체" },
    { label: "Informal polite", korean: "해요체" },
    { label: "Formal polite", korean: "하십시오체" },
] as const;

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

function formalForm(stem: string, readingStem = stem) {
    return hasFinalConsonant(readingStem) ? `${stem}습니다` : `${appendFinalConsonant(stem, 17)}니다`;
}

function formalQuestion(stem: string, readingStem = stem) {
    return hasFinalConsonant(readingStem) ? `${stem}습니까` : `${appendFinalConsonant(stem, 17)}니까`;
}

function formalPropositive(stem: string, readingStem = stem) {
    return hasFinalConsonant(readingStem) ? `${stem}읍시다` : `${appendFinalConsonant(stem, 17)}시다`;
}

function formalImperative(stem: string, readingStem = stem) {
    return hasFinalConsonant(readingStem) ? `${stem}으십시오` : `${stem}십시오`;
}

function pastEnding(stem: string) {
    return lastVowelIsAOrO(stem) ? "았다" : "었다";
}

function lowForm(stem: string, readingStem = stem) {
    return `${stem}${lastVowelIsAOrO(readingStem) ? "아" : "어"}`;
}

function politeForm(stem: string, readingStem = stem) {
    return `${lowForm(stem, readingStem)}요`;
}

function plainVerbPresent(stem: string) {
    return hasFinalConsonant(stem) ? `${stem}는다` : `${appendFinalConsonant(stem, 4)}다`;
}

function plainVerbQuestion(stem: string) {
    return hasFinalConsonant(stem) ? `${stem}느냐` : `${appendFinalConsonant(stem, 4)}냐`;
}

function plainImperative(stem: string) {
    return hasFinalConsonant(stem) ? `${stem}으라` : `${stem}라`;
}

function plainPropositive(stem: string) {
    return `${stem}자`;
}

function pastPlain(stem: string, readingStem = stem) {
    return `${stem}${pastEnding(readingStem)}`;
}

function pastPlainInterrogative(stem: string, readingStem = stem, kind: ConjugationKind) {
    return `${stem}${lastVowelIsAOrO(readingStem) ? "았" : "었"}${kind === "Verb" ? "느냐" : "냐"}`;
}

function pastIntimate(stem: string, readingStem = stem) {
    return `${stem}${lastVowelIsAOrO(readingStem) ? "았어" : "었어"}`;
}

function pastPolite(stem: string, readingStem = stem) {
    return `${pastIntimate(stem, readingStem)}요`;
}

function pastFormal(stem: string, readingStem = stem) {
    return `${stem}${lastVowelIsAOrO(readingStem) ? "았습니다" : "었습니다"}`;
}

function finalAttributive(stem: string, readingStem = stem) {
    return hasFinalConsonant(readingStem) ? `${stem}은` : appendFinalConsonant(stem, 4);
}

function futureDeterminer(stem: string, readingStem = stem) {
    return hasFinalConsonant(readingStem) ? `${stem}을` : appendFinalConsonant(stem, 8);
}

function verbalNoun(stem: string, readingStem = stem) {
    return hasFinalConsonant(readingStem) ? `${stem}음` : appendFinalConsonant(stem, 16);
}

function cell(form: string | undefined | null | false): ConjugationCell {
    return { form: form || "" };
}

function notedCell(note: string, form: string): ConjugationCell {
    return { form, note };
}

function row(label: string, cells: RegisterCells): ConjugationMatrixRow {
    return { label, cells };
}

function labeledForm(label: string, value: string): ConjugationListForm {
    return { label, value };
}

function item(label: string, forms: ConjugationListForm[] | ConjugationListForm, note?: string): ConjugationListItem {
    return { label, forms: Array.isArray(forms) ? forms : [forms], note };
}

function listTableRows(item: ConjugationListItem): ConjugationListTableRow[] {
    return item.forms.map((form) => ({
            itemLabel: `${form.label} ${item.label}`,
            form: form.value,
            note: item.note,
    }));
}

function regularHonorificStems(mixedStem: string, hangulStem: string) {
    const suffix = hasFinalConsonant(hangulStem) ? "으시" : "시";
    const lowSuffix = hasFinalConsonant(hangulStem) ? "으셔" : "셔";
    return {
        stem: `${mixedStem}${suffix}`,
        readingStem: `${hangulStem}${suffix}`,
        low: `${mixedStem}${lowSuffix}`,
        readingLow: `${hangulStem}${lowSuffix}`,
    };
}

function buildConjugationTable(target: ConjugationTarget): ConjugationTable {
    const isHada = target.hangul.endsWith("하다") && target.mixed.endsWith("하다");
    const hangulStem = isHada ? target.hangul.slice(0, -2) : target.hangul.slice(0, -1);
    const mixedStem = isHada ? target.mixed.slice(0, -2) : target.mixed.slice(0, -1);

    if (isHada) {
        const ordinaryRows = target.kind === "Verb"
            ? [
                row("indicative present", [
                    cell(`${mixedStem}한다`),
                    cell(`${mixedStem}해`),
                    cell(`${mixedStem}해요`),
                    cell(`${mixedStem}합니다`),
                ]),
                row("indicative past", [
                    cell(`${mixedStem}했다`),
                    cell(`${mixedStem}했어`),
                    cell(`${mixedStem}했어요`),
                    cell(`${mixedStem}했습니다`),
                ]),
                row("interrogative present", [
                    cell(`${mixedStem}하느냐`),
                    cell(`${mixedStem}해`),
                    cell(`${mixedStem}해요`),
                    cell(`${mixedStem}합니까`),
                ]),
                row("interrogative past", [
                    cell(`${mixedStem}했느냐`),
                    cell(`${mixedStem}했어`),
                    cell(`${mixedStem}했어요`),
                    cell(`${mixedStem}했습니까`),
                ]),
                row("imperative", [
                    cell(`${mixedStem}해라`),
                    cell(`${mixedStem}해`),
                    cell(`${mixedStem}하세요`),
                    cell(`${mixedStem}하십시오`),
                ]),
                row("propositive", [
                    cell(`${mixedStem}하자`),
                    cell(`${mixedStem}해`),
                    cell(`${mixedStem}해요`),
                    cell(`${mixedStem}합시다`),
                ]),
                row("assertive", [
                    cell(`${mixedStem}하겠다`),
                    cell(`${mixedStem}하겠어`),
                    cell(`${mixedStem}하겠어요`),
                    cell(`${mixedStem}하겠습니다`),
                ]),
            ]
            : [
                row("indicative present", [
                    cell(target.mixed),
                    cell(`${mixedStem}해`),
                    cell(`${mixedStem}해요`),
                    cell(`${mixedStem}합니다`),
                ]),
                row("indicative past", [
                    cell(`${mixedStem}했다`),
                    cell(`${mixedStem}했어`),
                    cell(`${mixedStem}했어요`),
                    cell(`${mixedStem}했습니다`),
                ]),
                row("interrogative present", [
                    cell(`${mixedStem}하냐`),
                    cell(`${mixedStem}해`),
                    cell(`${mixedStem}해요`),
                    cell(`${mixedStem}합니까`),
                ]),
                row("interrogative past", [
                    cell(`${mixedStem}했냐`),
                    cell(`${mixedStem}했어`),
                    cell(`${mixedStem}했어요`),
                    cell(`${mixedStem}했습니까`),
                ]),
                row("assertive", [
                    cell(`${mixedStem}하겠다`),
                    cell(`${mixedStem}하겠어`),
                    cell(`${mixedStem}하겠어요`),
                    cell(`${mixedStem}하겠습니다`),
                ]),
            ];

        const honorificRows = target.kind === "Verb"
            ? [
                row("indicative present", [
                    cell(`${mixedStem}하신다`),
                    cell(`${mixedStem}하셔`),
                    cell(`${mixedStem}하세요`),
                    cell(`${mixedStem}하십니다`),
                ]),
                row("indicative past", [
                    cell(`${mixedStem}하셨다`),
                    cell(`${mixedStem}하셨어`),
                    cell(`${mixedStem}하셨어요`),
                    cell(`${mixedStem}하셨습니다`),
                ]),
                row("interrogative present", [
                    cell(`${mixedStem}하시느냐`),
                    cell(`${mixedStem}하셔`),
                    cell(`${mixedStem}하세요`),
                    cell(`${mixedStem}하십니까`),
                ]),
                row("interrogative past", [
                    cell(`${mixedStem}하셨느냐`),
                    cell(`${mixedStem}하셨어`),
                    cell(`${mixedStem}하셨어요`),
                    cell(`${mixedStem}하셨습니까`),
                ]),
                row("imperative", [
                    cell(`${mixedStem}하셔라`),
                    cell(`${mixedStem}하셔`),
                    cell(`${mixedStem}하세요`),
                    cell(`${mixedStem}하십시오`),
                ]),
                row("propositive", [
                    cell(`${mixedStem}하시자`),
                    cell(`${mixedStem}하셔`),
                    cell(`${mixedStem}하세요`),
                    cell(`${mixedStem}하십시다`),
                ]),
                row("assertive", [
                    cell(`${mixedStem}하시겠다`),
                    cell(`${mixedStem}하시겠어`),
                    cell(`${mixedStem}하시겠어요`),
                    cell(`${mixedStem}하시겠습니다`),
                ]),
            ]
            : [
                row("indicative present", [
                    cell(`${mixedStem}하시다`),
                    cell(`${mixedStem}하셔`),
                    cell(`${mixedStem}하세요`),
                    cell(`${mixedStem}하십니다`),
                ]),
                row("indicative past", [
                    cell(`${mixedStem}하셨다`),
                    cell(`${mixedStem}하셨어`),
                    cell(`${mixedStem}하셨어요`),
                    cell(`${mixedStem}하셨습니다`),
                ]),
                row("interrogative present", [
                    cell(`${mixedStem}하시냐`),
                    cell(`${mixedStem}하셔`),
                    cell(`${mixedStem}하세요`),
                    cell(`${mixedStem}하십니까`),
                ]),
                row("interrogative past", [
                    cell(`${mixedStem}하셨냐`),
                    cell(`${mixedStem}하셨어`),
                    cell(`${mixedStem}하셨어요`),
                    cell(`${mixedStem}하셨습니까`),
                ]),
                row("assertive", [
                    cell(`${mixedStem}하시겠다`),
                    cell(`${mixedStem}하시겠어`),
                    cell(`${mixedStem}하시겠어요`),
                    cell(`${mixedStem}하시겠습니다`),
                ]),
            ];

        return {
            matrixSections: [
                { title: "Sentence-final forms", rows: ordinaryRows },
                { title: "Sentence-final forms with honorific", rows: honorificRows },
            ],
            listSections: [
                {
                    title: "Connective forms",
                    items: [
                        item("connective", [
                            labeledForm("low", `${mixedStem}해`),
                            labeledForm("cause/reason -서", `${mixedStem}해서`),
                            labeledForm("cause/reason -니", `${mixedStem}하니`),
                            labeledForm("cause/reason -니까", `${mixedStem}하니까`),
                        ]),
                        item("contrast", target.kind === "Verb"
                            ? [
                                labeledForm("-지만", `${mixedStem}하지만`),
                                labeledForm("-는데", `${mixedStem}하는데`),
                                labeledForm("-더니", `${mixedStem}하더니`),
                            ]
                            : [
                                labeledForm("-지만", `${mixedStem}하지만`),
                                labeledForm("-ㄴ데", `${mixedStem}한데`),
                                labeledForm("-더니", `${mixedStem}하더니`),
                            ]),
                        item("conjunction", labeledForm("-고", `${mixedStem}하고`)),
                        item("condition", [
                            labeledForm("-면", `${mixedStem}하면`),
                            labeledForm("-야", `${mixedStem}해야`),
                        ]),
                    ],
                },
                {
                    title: "Noun and determiner forms",
                    items: [
                        item("verbal noun", [
                            labeledForm("-ㅁ", `${mixedStem}함`),
                            labeledForm("-기", `${mixedStem}하기`),
                        ]),
                        item("past-tense verbal noun", [
                            labeledForm("-ㅁ", `${mixedStem}했음`),
                            labeledForm("-기", `${mixedStem}했기`),
                        ]),
                        item("determiner", target.kind === "Verb"
                            ? [
                                labeledForm("past", `${mixedStem}한`),
                                labeledForm("present", `${mixedStem}하는`),
                                labeledForm("future", `${mixedStem}할`),
                            ]
                            : [
                                labeledForm("present", `${mixedStem}한`),
                                labeledForm("future", `${mixedStem}할`),
                            ]),
                        ...(target.kind === "Adjective" ? [item("adverbial", labeledForm("-게", `${mixedStem}하게`))] : []),
                    ],
                },
            ],
        };
    }

    const informal = lowForm(mixedStem, hangulStem);
    const polite = politeForm(mixedStem, hangulStem);
    const plainDeclarative = target.kind === "Verb" ? plainVerbPresent(mixedStem) : target.mixed;
    const plainQuestion = target.kind === "Verb" ? plainVerbQuestion(mixedStem) : `${mixedStem}냐`;
    const note = "Regular fallback";
    const futureStem = `${mixedStem}겠`;
    const futureReadingStem = `${hangulStem}겠`;
    const honorific = regularHonorificStems(mixedStem, hangulStem);
    const sentenceRows = target.kind === "Verb"
        ? [
            row("indicative present", [
                notedCell(note, plainDeclarative),
                notedCell(note, informal),
                notedCell(note, polite),
                notedCell(note, formalForm(mixedStem, hangulStem)),
            ]),
            row("indicative past", [
                notedCell(note, pastPlain(mixedStem, hangulStem)),
                notedCell(note, pastIntimate(mixedStem, hangulStem)),
                notedCell(note, pastPolite(mixedStem, hangulStem)),
                notedCell(note, pastFormal(mixedStem, hangulStem)),
            ]),
            row("interrogative present", [
                notedCell(note, plainQuestion),
                notedCell(note, informal),
                notedCell(note, polite),
                notedCell(note, formalQuestion(mixedStem, hangulStem)),
            ]),
            row("interrogative past", [
                notedCell(note, pastPlainInterrogative(mixedStem, hangulStem, target.kind)),
                notedCell(note, pastIntimate(mixedStem, hangulStem)),
                notedCell(note, pastPolite(mixedStem, hangulStem)),
                notedCell(note, `${mixedStem}${lastVowelIsAOrO(hangulStem) ? "았습니까" : "었습니까"}`),
            ]),
            row("imperative", [
                notedCell(note, plainImperative(mixedStem)),
                notedCell(note, informal),
                notedCell(note, `${mixedStem}${hasFinalConsonant(hangulStem) ? "으세요" : "세요"}`),
                notedCell(note, formalImperative(mixedStem, hangulStem)),
            ]),
            row("propositive", [
                notedCell(note, plainPropositive(mixedStem)),
                notedCell(note, informal),
                notedCell(note, polite),
                notedCell(note, formalPropositive(mixedStem, hangulStem)),
            ]),
            row("assertive", [
                notedCell(note, `${futureStem}다`),
                notedCell(note, `${futureStem}어`),
                notedCell(note, `${futureStem}어요`),
                notedCell(note, formalForm(futureStem, futureReadingStem)),
            ]),
        ]
        : [
            row("indicative present", [
                notedCell(note, plainDeclarative),
                notedCell(note, informal),
                notedCell(note, polite),
                notedCell(note, formalForm(mixedStem, hangulStem)),
            ]),
            row("indicative past", [
                notedCell(note, pastPlain(mixedStem, hangulStem)),
                notedCell(note, pastIntimate(mixedStem, hangulStem)),
                notedCell(note, pastPolite(mixedStem, hangulStem)),
                notedCell(note, pastFormal(mixedStem, hangulStem)),
            ]),
            row("interrogative present", [
                notedCell(note, plainQuestion),
                notedCell(note, informal),
                notedCell(note, polite),
                notedCell(note, formalQuestion(mixedStem, hangulStem)),
            ]),
            row("interrogative past", [
                notedCell(note, pastPlainInterrogative(mixedStem, hangulStem, target.kind)),
                notedCell(note, pastIntimate(mixedStem, hangulStem)),
                notedCell(note, pastPolite(mixedStem, hangulStem)),
                notedCell(note, `${mixedStem}${lastVowelIsAOrO(hangulStem) ? "았습니까" : "었습니까"}`),
            ]),
            row("assertive", [
                notedCell(note, `${futureStem}다`),
                notedCell(note, `${futureStem}어`),
                notedCell(note, `${futureStem}어요`),
                notedCell(note, formalForm(futureStem, futureReadingStem)),
            ]),
        ];

    const honorificRows = target.kind === "Verb"
        ? [
            row("indicative present", [
                notedCell(note, plainVerbPresent(honorific.stem)),
                notedCell(note, honorific.low),
                notedCell(note, `${honorific.low}요`),
                notedCell(note, formalForm(honorific.stem, honorific.readingStem)),
            ]),
            row("indicative past", [
                notedCell(note, pastPlain(honorific.stem, honorific.readingStem)),
                notedCell(note, pastIntimate(honorific.stem, honorific.readingStem)),
                notedCell(note, pastPolite(honorific.stem, honorific.readingStem)),
                notedCell(note, pastFormal(honorific.stem, honorific.readingStem)),
            ]),
            row("interrogative present", [
                notedCell(note, plainVerbQuestion(honorific.stem)),
                notedCell(note, honorific.low),
                notedCell(note, `${honorific.low}요`),
                notedCell(note, formalQuestion(honorific.stem, honorific.readingStem)),
            ]),
            row("interrogative past", [
                notedCell(note, pastPlainInterrogative(honorific.stem, honorific.readingStem, target.kind)),
                notedCell(note, pastIntimate(honorific.stem, honorific.readingStem)),
                notedCell(note, pastPolite(honorific.stem, honorific.readingStem)),
                notedCell(note, `${honorific.stem}${lastVowelIsAOrO(honorific.readingStem) ? "았습니까" : "었습니까"}`),
            ]),
            row("imperative", [
                notedCell(note, plainImperative(honorific.stem)),
                notedCell(note, honorific.low),
                notedCell(note, `${honorific.low}요`),
                notedCell(note, formalImperative(honorific.stem, honorific.readingStem)),
            ]),
            row("propositive", [
                notedCell(note, plainPropositive(honorific.stem)),
                notedCell(note, honorific.low),
                notedCell(note, `${honorific.low}요`),
                notedCell(note, formalPropositive(honorific.stem, honorific.readingStem)),
            ]),
            row("assertive", [
                notedCell(note, `${honorific.stem}겠다`),
                notedCell(note, `${honorific.stem}겠어`),
                notedCell(note, `${honorific.stem}겠어요`),
                notedCell(note, formalForm(`${honorific.stem}겠`, `${honorific.readingStem}겠`)),
            ]),
        ]
        : [
            row("indicative present", [
                notedCell(note, `${honorific.stem}다`),
                notedCell(note, honorific.low),
                notedCell(note, `${honorific.low}요`),
                notedCell(note, formalForm(honorific.stem, honorific.readingStem)),
            ]),
            row("indicative past", [
                notedCell(note, pastPlain(honorific.stem, honorific.readingStem)),
                notedCell(note, pastIntimate(honorific.stem, honorific.readingStem)),
                notedCell(note, pastPolite(honorific.stem, honorific.readingStem)),
                notedCell(note, pastFormal(honorific.stem, honorific.readingStem)),
            ]),
            row("interrogative present", [
                notedCell(note, `${honorific.stem}냐`),
                notedCell(note, honorific.low),
                notedCell(note, `${honorific.low}요`),
                notedCell(note, formalQuestion(honorific.stem, honorific.readingStem)),
            ]),
            row("interrogative past", [
                notedCell(note, pastPlainInterrogative(honorific.stem, honorific.readingStem, target.kind)),
                notedCell(note, pastIntimate(honorific.stem, honorific.readingStem)),
                notedCell(note, pastPolite(honorific.stem, honorific.readingStem)),
                notedCell(note, `${honorific.stem}${lastVowelIsAOrO(honorific.readingStem) ? "았습니까" : "었습니까"}`),
            ]),
            row("assertive", [
                notedCell(note, `${honorific.stem}겠다`),
                notedCell(note, `${honorific.stem}겠어`),
                notedCell(note, `${honorific.stem}겠어요`),
                notedCell(note, formalForm(`${honorific.stem}겠`, `${honorific.readingStem}겠`)),
            ]),
        ];

    return {
        matrixSections: [
            { title: "Sentence-final forms", note, rows: sentenceRows },
            { title: "Sentence-final forms with honorific", note, rows: honorificRows },
        ],
        listSections: [
            {
                title: "Connective forms",
                note,
                items: [
                    item("connective", [
                        labeledForm("low", informal),
                        labeledForm("cause/reason -서", `${informal}서`),
                        labeledForm("cause/reason -니", `${mixedStem}${hasFinalConsonant(hangulStem) ? "으니" : "니"}`),
                        labeledForm("cause/reason -니까", `${mixedStem}${hasFinalConsonant(hangulStem) ? "으니까" : "니까"}`),
                    ], note),
                    item("contrast", [
                        labeledForm("-지만", `${mixedStem}지만`),
                        labeledForm(hasFinalConsonant(hangulStem) ? "-은데" : "-는데", `${mixedStem}${hasFinalConsonant(hangulStem) ? "은데" : "는데"}`),
                        labeledForm("-더니", `${mixedStem}더니`),
                    ], note),
                    item("conjunction", labeledForm("-고", `${mixedStem}고`), note),
                    item("condition", [
                        labeledForm("-면", `${mixedStem}면`),
                        labeledForm("-야", `${informal}야`),
                    ], note),
                    ...(target.kind === "Adjective" ? [item("adverbial", labeledForm("-게", `${mixedStem}게`), note)] : []),
                ],
            },
            {
                title: "Noun and determiner forms",
                note,
                items: [
                    item("verbal noun", [
                        labeledForm("-ㅁ", verbalNoun(mixedStem, hangulStem)),
                        labeledForm("-기", `${mixedStem}기`),
                    ], note),
                    item("past-tense verbal noun", [
                        labeledForm("-ㅁ", `${pastIntimate(mixedStem, hangulStem).slice(0, -1)}음`),
                        labeledForm("-기", `${pastIntimate(mixedStem, hangulStem).slice(0, -1)}기`),
                    ], note),
                    item("determiner", target.kind === "Verb"
                        ? [
                            labeledForm("past", finalAttributive(mixedStem, hangulStem)),
                            labeledForm("present", `${mixedStem}는`),
                            labeledForm("future", futureDeterminer(mixedStem, hangulStem)),
                        ]
                        : [
                            labeledForm("present", finalAttributive(mixedStem, hangulStem)),
                            labeledForm("future", futureDeterminer(mixedStem, hangulStem)),
                        ], note),
                ],
            },
        ],
    };
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

function shouldStackHeadword(hanja: string, hangul: string) {
    const compactDisplay = Array.from(hanja.replace(/\s+/g, ""));
    const compactReading = Array.from(hangul.replace(/\s+/g, ""));
    return compactDisplay.length >= 10 || compactReading.length >= 12;
}

export function Entry({
    hanja,
    hangul,
    alternateHanja = [],
    alternateForms = [],
    definitions,
    proficiency = [],
}: Readonly<{
    hanja: string;
    hangul: string;
    alternateHanja?: string[];
    alternateForms?: AlternateForm[];
    definitions: Definition[];
    proficiency?: ProficiencyBadge[];
    confidence?: number;
    reviewStatus?: string;
}>) {
    const [conjugationTarget, setConjugationTarget] = useState<ConjugationTarget | null>(null);
    const headwordRef = useRef<HTMLDivElement>(null);
    const [measuredStackHeadword, setMeasuredStackHeadword] = useState(false);
    const conjugationTable = useMemo(
        () => (conjugationTarget ? buildConjugationTable(conjugationTarget) : null),
        [conjugationTarget],
    );
    const cleanedAlternates: AlternateForm[] = [
        ...alternateForms,
        ...alternateHanja
            .filter((alternate) => alternate !== hanja)
            .map((alternate) => ({ form: alternate })),
    ];
    const heuristicStackHeadword = shouldStackHeadword(hanja, hangul);
    const stackHeadword = heuristicStackHeadword || measuredStackHeadword;
    const articleClassName = [
        "group grid w-full gap-7 rounded-xl border border-stone-800/90 bg-[#171310]/95 p-5 shadow-[0_16px_48px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.03] transition-colors hover:border-stone-700 md:p-7",
        stackHeadword ? "md:grid-cols-1" : "md:grid-cols-[17rem_1fr]",
    ].join(" ");
    const headwordClassName = [
        "headword-script text-4xl font-medium leading-tight text-stone-50 md:text-5xl",
        "max-w-full overflow-x-auto whitespace-nowrap pb-2 [scrollbar-width:thin]",
    ].join(" ");

    useEffect(() => {
        const headword = headwordRef.current;
        if (!headword) return;

        const update = () => {
            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const twoColumnHeadwordWidth = 17 * rootFontSize;
            setMeasuredStackHeadword(window.innerWidth >= 768 && headword.scrollWidth > twoColumnHeadwordWidth + 1);
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(headword);
        window.addEventListener("resize", update);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", update);
        };
    }, [hanja, hangul]);

    return (
        <article className={articleClassName}>
            <div className="min-w-0">
                <div ref={headwordRef} className={headwordClassName}>
                    {renderHeadword(hanja, hangul)}
                </div>
                {proficiency.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                        {proficiency.map((badge) => (
                            <span
                                key={`${badge.system}-${badge.level}`}
                                className="rounded-md border border-sky-300/25 bg-sky-400/14 px-3 py-1 text-xs font-semibold text-sky-100"
                            >
                                {formatProficiencyLabel(badge.label)}
                            </span>
                        ))}
                    </div>
                )}
                {cleanedAlternates.length > 0 && (
                    <div className="mt-6">
                        <div className="mb-2 text-[0.7rem] font-semibold text-stone-500">
                            Other forms
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {cleanedAlternates.map((alternate) => (
                                <a
                                    key={`${alternate.form}-${alternate.reading ?? ""}-${alternate.label ?? ""}`}
                                    href={searchHref(alternate)}
                                    className="rounded-lg border border-emerald-300/20 bg-emerald-950/20 px-3.5 py-2.5 text-stone-100 shadow-sm ring-1 ring-white/[0.03]"
                                >
                                    <span className={hasKoreanScript(alternate.form) ? "korean-text text-2xl leading-none" : "text-2xl font-medium leading-none"}>{alternate.form}</span>
                                    {alternate.reading && (
                                        <span className="korean-text ml-2 align-baseline text-lg text-stone-300">
                                            {alternate.reading}
                                        </span>
                                    )}
                                    {alternate.label && (
                                        <span className="ml-2 rounded-full bg-emerald-300/15 px-2 py-0.5 align-middle text-[0.65rem] font-semibold text-emerald-200">
                                            {alternate.label}
                                        </span>
                                    )}
                                </a>
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
                                    <a
                                        href={searchHref(definition.formOf)}
                                        className="mr-2 inline-flex items-center rounded-full bg-emerald-300/12 px-2.5 py-1 align-middle text-sm font-semibold text-emerald-200 ring-1 ring-emerald-300/20 transition-colors hover:bg-emerald-300/18 hover:text-emerald-100"
                                    >
                                        <span className="font-[family-name:var(--font-ui)]">as&nbsp;</span>
                                        <span className="korean-text">{definition.formOf.form}</span>
                                    </a>
                                )}
                                <span>{renderSearchLinkedText(definition.text)}</span>
                                {definition.seeAlso && definition.seeAlso.length > 0 && (
                                    <span className="ml-3 inline-flex flex-wrap items-center gap-2 align-middle text-base text-stone-400">
                                        <span className="font-semibold">See also</span>
                                        {definition.seeAlso.map((form) => (
                                            <a
                                                key={`${form.form}-${form.reading ?? ""}-${form.label ?? ""}`}
                                                href={searchHref(form)}
                                                className="inline-flex items-baseline gap-1 rounded-full border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 font-semibold text-sky-200 transition-colors hover:border-sky-200/45 hover:bg-sky-300/15 hover:text-sky-100"
                                            >
                                                <span className={hasKoreanScript(form.form) ? "korean-text" : undefined}>{form.form}</span>
                                                {form.reading && form.reading !== form.form && (
                                                    <span className="korean-text text-sm text-sky-100/70">{form.reading}</span>
                                                )}
                                            </a>
                                        ))}
                                    </span>
                                )}
                                {definition.examples.length > 0 && (
                                    <div className="mt-4 space-y-3">
                                        {definition.examples.map((example, exampleIndex) => renderExample(example, exampleIndex))}
                                    </div>
                                )}
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
                        className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-xl border border-stone-700 bg-[#171310] shadow-2xl ring-1 ring-white/10"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-stone-800 px-5 py-4">
                            <div>
                                <div className="text-xs font-semibold text-emerald-300/80">
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
                        <div className="max-h-[65vh] space-y-6 overflow-auto p-5">
                            {conjugationTable?.matrixSections.map((section) => (
                                <section key={section.title} className="min-w-[48rem]">
                                    <div className="mb-3 flex flex-wrap items-baseline gap-2">
                                        <h3 className="text-xs font-semibold text-emerald-200">
                                            {section.title}
                                        </h3>
                                        {section.note && (
                                            <span className="rounded-full border border-stone-700 px-2 py-0.5 text-[0.65rem] font-semibold text-stone-500">
                                                {section.note}
                                            </span>
                                        )}
                                    </div>
                                    <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-lg border border-stone-800 text-left text-sm">
                                        <thead className="bg-stone-950/50 text-[0.68rem] text-stone-500">
                                            <tr>
                                                <th className="w-32 border-b border-stone-800 px-3 py-3 font-semibold">Form</th>
                                                {REGISTER_COLUMNS.map((column) => (
                                                    <th key={column.korean} className="border-b border-stone-800 px-3 py-3 font-semibold">
                                                        <span>{column.label}</span>
                                                        <span className="korean-text mt-1 block text-[0.8rem] normal-case tracking-normal text-stone-300">
                                                            {column.korean}
                                                        </span>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {section.rows.map((conjugationRow) => (
                                                <tr key={`${section.title}-${conjugationRow.label}`} className="align-top">
                                                    <th className="border-b border-stone-800/70 bg-stone-950/25 px-3 py-3 text-left text-xs font-semibold text-stone-400">
                                                        {conjugationRow.label}
                                                    </th>
                                                    {conjugationRow.cells.map((conjugationCell, index) => (
                                                        <td
                                                            key={`${section.title}-${conjugationRow.label}-${REGISTER_COLUMNS[index].korean}`}
                                                            className="border-b border-stone-800/70 px-3 py-3"
                                                        >
                                                            {conjugationCell.form ? (
                                                                <div className="headword-script text-lg leading-snug text-stone-100">
                                                                    {conjugationCell.form}
                                                                </div>
                                                            ) : (
                                                                <div className="text-stone-600">-</div>
                                                            )}
                                                            {conjugationCell.note && (
                                                                <div className="mt-2 text-[0.65rem] text-stone-600">
                                                                    {conjugationCell.note}
                                                                </div>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </section>
                            ))}
                            {conjugationTable?.listSections.map((section) => (
                                <section key={section.title} className="min-w-[48rem]">
                                    <div className="mb-3 flex flex-wrap items-baseline gap-2">
                                        <h3 className="text-xs font-semibold text-emerald-200">
                                            {section.title}
                                        </h3>
                                        {section.note && (
                                            <span className="rounded-full border border-stone-700 px-2 py-0.5 text-[0.65rem] font-semibold text-stone-500">
                                                {section.note}
                                            </span>
                                        )}
                                    </div>
                                    <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-lg border border-stone-800 text-left text-sm">
                                        <thead className="bg-stone-950/50 text-[0.68rem] text-stone-500">
                                            <tr>
                                                <th className="w-56 border-b border-stone-800 px-3 py-3 font-semibold">Form</th>
                                                <th className="border-b border-stone-800 px-3 py-3 font-semibold">Conjugation</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {section.items.flatMap((listItem) => listTableRows(listItem)).map((tableRow) => (
                                                <tr key={`${section.title}-${tableRow.itemLabel}-${tableRow.form}`} className="align-top">
                                                    <th className="border-b border-stone-800/70 bg-stone-950/25 px-3 py-3 text-left text-xs font-semibold text-stone-400">
                                                        {tableRow.itemLabel}
                                                    </th>
                                                    <td className="border-b border-stone-800/70 px-3 py-3">
                                                        <div className="headword-script text-lg leading-snug text-stone-100">
                                                            {tableRow.form}
                                                        </div>
                                                        {tableRow.note && (
                                                            <div className="mt-2 text-[0.65rem] text-stone-600">
                                                                {tableRow.note}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </section>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}
