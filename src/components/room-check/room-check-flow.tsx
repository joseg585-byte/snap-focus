"use client";

import { useState } from "react";
import Link from "next/link";
import { ROOM_CHECK_LEVELS, type RoomCheckLevel } from "@/lib/config";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AreaVerdict {
  title: string;
  pass: boolean;
  note: string;
}

interface RoomCheckResult {
  ok: true;
  id: string;
  balance: number;
  level: RoomCheckLevel;
  overallPass: boolean;
  summary: string;
  areas: AreaVerdict[];
}

type Phase = "pick" | "wizard" | "submitting" | "result";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function RoomCheckFlow() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [level, setLevel] = useState<RoomCheckLevel | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [result, setResult] = useState<RoomCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = level ? ROOM_CHECK_LEVELS.find((l) => l.id === level)! : null;

  function startLevel(l: RoomCheckLevel) {
    setLevel(l);
    setStepIndex(0);
    setPhotos([]);
    setResult(null);
    setError(null);
    setPhase("wizard");
  }

  function reset() {
    setPhase("pick");
    setLevel(null);
    setStepIndex(0);
    setPhotos([]);
    setResult(null);
    setError(null);
  }

  async function handlePhoto(file: File) {
    const dataUrl = await fileToDataUrl(file);
    setPhotos((prev) => {
      const next = [...prev];
      next[stepIndex] = dataUrl;
      return next;
    });
  }

  async function submit(finalPhotos: string[]) {
    if (!level) return;
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch("/api/room-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          photos: finalPhotos,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.suggestion || data.error || "Something went wrong.");
        setPhase("wizard");
        return;
      }
      setResult(data as RoomCheckResult);
      setPhase("result");
    } catch {
      setError("Network error — please try again.");
      setPhase("wizard");
    }
  }

  // ---------- LEVEL PICKER ----------
  if (phase === "pick") {
    return (
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
          Room Check
        </h1>
        <p className="mt-2 text-cream/60">Pick a verification level to get started.</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-1">
          {ROOM_CHECK_LEVELS.map((l) => (
            <Card key={l.id} className="cursor-pointer" onClick={() => startLevel(l.id)}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{l.emoji}</span>
                    <h2 className="font-display text-xl uppercase tracking-tight text-cream">
                      {l.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-cream/70">{l.tagline}</p>
                </div>
                <Badge>
                  {l.cost} {l.cost === 1 ? "credit" : "credits"}
                </Badge>
              </div>
              <Button className="mt-4 w-full" variant={l.id === "quick" ? "primary" : "outline"}>
                Start {l.name}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ---------- WIZARD ----------
  if ((phase === "wizard" || phase === "submitting") && level && config) {
    const step = config.steps[stepIndex];
    const photo = photos[stepIndex];
    const isLastStep = stepIndex === config.steps.length - 1;

    return (
      <div>
        <button onClick={reset} className="text-sm text-cream/50 hover:text-cream">
          ← Change level
        </button>
        <div className="mt-4 flex items-center gap-2">
          {config.steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= stepIndex ? "bg-gold" : "bg-cream/15"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cream/50">
          Step {stepIndex + 1} of {config.steps.length}
        </p>

        <Card className="mt-4">
          <h2 className="font-display text-xl uppercase tracking-tight text-cream">
            {step.title}
          </h2>
          <p className="mt-1 text-cream/70">{step.prompt}</p>

          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={step.title}
              className="mt-4 max-h-80 w-full rounded-xl object-cover"
            />
          ) : (
            <div className="mt-4 flex h-48 items-center justify-center rounded-xl border border-dashed border-cream/20 text-cream/40">
              No photo yet
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-gold/40 px-5 text-sm font-semibold text-cream hover:border-gold hover:bg-gold/10">
              {photo ? "Retake photo" : "Take photo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhoto(file);
                  e.target.value = "";
                }}
              />
            </label>

            {stepIndex > 0 && (
              <Button variant="ghost" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
            )}

            {photo && !isLastStep && (
              <Button onClick={() => setStepIndex((i) => i + 1)}>Next</Button>
            )}

            {photo && isLastStep && (
              <Button
                disabled={phase === "submitting"}
                onClick={() => submit(photos)}
              >
                {phase === "submitting" ? "Verifying…" : "Submit for verification"}
              </Button>
            )}
          </div>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          {error?.toLowerCase().includes("credit") && (
            <Link href="/billing" className="mt-2 inline-block text-sm text-gold underline">
              Top up credits
            </Link>
          )}
        </Card>
      </div>
    );
  }

  // ---------- RESULT ----------
  if (phase === "result" && result) {
    return (
      <div>
        <Card className={result.overallPass ? "border-gold/60" : undefined}>
          <h1 className="font-display text-2xl uppercase tracking-tight text-cream">
            {result.overallPass ? "🎉 Looks clean!" : "Not quite there yet"}
          </h1>
          <p className="mt-2 text-cream/70">{result.summary}</p>

          <ul className="mt-6 space-y-4">
            {result.areas.map((area, i) => (
              <li key={i} className="flex gap-4 rounded-xl border border-cream/10 p-4">
                {photos[i] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photos[i]}
                    alt={area.title}
                    className="h-20 w-20 flex-shrink-0 rounded-lg object-cover"
                  />
                )}
                <div>
                  <p className="font-semibold text-cream">
                    {area.pass ? "✓" : "✗"} {area.title}
                  </p>
                  <p className="text-sm text-cream/60">{area.note}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={reset}>Run another check</Button>
            <Link
              href="/tools/room-check/history"
              className="inline-flex h-11 items-center justify-center rounded-full border border-gold/40 px-5 text-sm font-semibold text-cream hover:border-gold hover:bg-gold/10"
            >
              View history
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
