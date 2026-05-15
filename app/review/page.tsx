"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, RefreshCcw, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ruby } from "@/components/ui/ruby";

type ReviewCandidate = {
  hanja: string;
  koDefinition: string;
  enDefinitionHint?: string;
  pos: string[];
  domains: string[];
  score: number;
  sourceId?: string;
};

type ReviewItem = {
  id: string;
  hangul: string;
  englishGloss: string;
  englishSourceId: string;
  candidates: ReviewCandidate[];
};

type QueueResponse = {
  items: ReviewItem[];
  error?: string;
};

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export default function ReviewPage() {
  const [token, setToken] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const [status, setStatus] = useState("");
  const active = items[activeIndex];

  const reviewedCount = useMemo(() => Math.min(activeIndex, items.length), [activeIndex, items.length]);

  useEffect(() => {
    const saved = window.localStorage.getItem("saseo-review-token");
    if (saved) setToken(saved);
  }, []);

  async function loadQueue(nextToken = token) {
    setStatus("Loading review queue...");
    window.localStorage.setItem("saseo-review-token", nextToken);
    const response = await fetch("/api/review/queue", {
      headers: authHeaders(nextToken),
      cache: "no-cache",
    });
    const data = (await response.json()) as QueueResponse;
    if (!response.ok) {
      setStatus(data.error ?? "Could not load queue");
      return;
    }
    setItems(data.items);
    setActiveIndex(0);
    setSelectedCandidate(0);
    setStatus(`${data.items.length} items loaded`);
  }

  async function submitDecision(action: "approve" | "reject" | "skip") {
    if (!active) return;
    const candidate = active.candidates[selectedCandidate];
    const body =
      action === "approve" && candidate
        ? {
            action,
            itemId: active.id,
            entry: {
              id: `reviewed:${active.hangul}:${candidate.hanja}:${encodeURIComponent(active.englishGloss)}`,
              hangul: active.hangul,
              hanja: candidate.hanja,
              definitions: [
                {
                  text: active.englishGloss,
                  pos: candidate.pos,
                  examples: [],
                  tags: ["human-reviewed"],
                  sourceIds: [candidate.sourceId, active.englishSourceId].filter(Boolean),
                  confidence: 1,
                },
              ],
              provenance: [candidate.sourceId, active.englishSourceId, "human-review"].filter(Boolean),
              confidence: 1,
              reviewStatus: "reviewed",
            },
          }
        : {
            action,
            itemId: active.id,
            entryId: active.id,
          };

    const response = await fetch("/api/review/decisions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setStatus(data.error ?? "Decision failed");
      return;
    }

    setStatus(action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Skipped");
    setActiveIndex((index) => Math.min(index + 1, items.length));
    setSelectedCandidate(0);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="border-b border-neutral-800 px-6 py-6 md:px-12">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              <Ruby text="辭" ruby="사" />
              <Ruby text="書" ruby="서" /> Review
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Align English glosses to Hanja-backed Korean senses. Approved choices are appended to the review decisions file and picked up by the next lexicon build.
            </p>
          </div>
          <div className="flex w-full gap-2 md:w-[32rem]">
            <div className="relative flex-1">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                type="password"
                placeholder="Review token"
                className="border-neutral-700 bg-neutral-900 pl-9 text-white"
              />
            </div>
            <Button onClick={() => loadQueue()} className="bg-neutral-200 text-neutral-950 hover:bg-white">
              <RefreshCcw className="mr-2 h-4 w-4" /> Load
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 px-6 py-6 md:grid-cols-[18rem_1fr] md:px-12">
        <aside className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-sm text-neutral-400">Progress</div>
          <div className="mt-1 text-2xl font-semibold">
            {reviewedCount}/{items.length}
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded bg-neutral-800">
            <div
              className="h-full bg-teal-400"
              style={{ width: items.length ? `${(reviewedCount / items.length) * 100}%` : "0%" }}
            />
          </div>
          <div className="mt-4 text-sm text-neutral-300">{status}</div>
        </aside>

        {active ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 p-5">
              <div className="text-sm uppercase tracking-wide text-neutral-500">English gloss</div>
              <div className="mt-2 flex flex-wrap items-baseline gap-4">
                <div className="text-3xl font-semibold">{active.englishGloss}</div>
                <div className="text-lg text-neutral-400">{active.hangul}</div>
              </div>
            </div>

            <div className="grid gap-3 p-5">
              {active.candidates.map((candidate, index) => (
                <button
                  key={`${candidate.hanja}-${candidate.sourceId}`}
                  onClick={() => setSelectedCandidate(index)}
                  className={`rounded-lg border p-4 text-left transition ${
                    selectedCandidate === index
                      ? "border-teal-300 bg-neutral-800"
                      : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-3xl font-semibold">
                      {candidate.hanja}
                      <span className="ml-3 text-base text-neutral-400">{candidate.pos.join(", ")}</span>
                    </div>
                    <div className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
                      score {(candidate.score * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="mt-3 text-neutral-200">{candidate.koDefinition}</div>
                  {candidate.enDefinitionHint && (
                    <div className="mt-2 text-sm text-neutral-400">{candidate.enDefinitionHint}</div>
                  )}
                  {candidate.domains.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidate.domains.map((domain) => (
                        <span key={domain} className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
                          {domain}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-800 p-5">
              <Button onClick={() => submitDecision("skip")} className="bg-neutral-700 hover:bg-neutral-600">
                <SkipForward className="mr-2 h-4 w-4" /> Skip
              </Button>
              <Button onClick={() => submitDecision("reject")} className="bg-red-700 hover:bg-red-600">
                <X className="mr-2 h-4 w-4" /> Reject
              </Button>
              <Button onClick={() => submitDecision("approve")} className="bg-teal-500 text-neutral-950 hover:bg-teal-400">
                <Check className="mr-2 h-4 w-4" /> Approve
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-neutral-300">
            Load the queue to start reviewing, or rebuild the lexicon if there are no remaining items.
          </div>
        )}
      </section>
    </main>
  );
}
