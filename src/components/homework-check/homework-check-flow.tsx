"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Issue {
  question_ref: string;
  issue: string;
}

interface HomeworkCheckResult {
  ok: true;
  id: string;
  balance: number;
  verdict: "pass" | "fail" | "not_homework";
  feedback: string;
  issues: Issue[];
}

type Phase = "capture" | "submitting" | "result";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const VERDICT_COPY: Record<HomeworkCheckResult["verdict"], { emoji: string; title: string }> = {
  pass: { emoji: "✅", title: "Looks done!" },
  fail: { emoji: "✗", title: "Not quite finished" },
  not_homework: { emoji: "🤔", title: "That doesn't look like homework" },
};

export function HomeworkCheckFlow() {
  const [phase, setPhase] = useState<Phase>("capture");
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<HomeworkCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePhoto(file: File) {
    setPhoto(await fileToDataUrl(file));
  }

  function reset() {
    setPhase("capture");
    setPhoto(null);
    setResult(null);
    setError(null);
  }

  async function submit() {
    if (!photo) return;
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch("/api/homework-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo, idempotencyKey: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.suggestion || data.error || "Something went wrong.");
        setPhase("capture");
        return;
      }
      setResult(data as HomeworkCheckResult);
      setPhase("result");
    } catch {
      setError("Network error — please try again.");
      setPhase("capture");
    }
  }

  if (phase === "result" && result) {
    const copy = VERDICT_COPY[result.verdict];
    return (
      <Card className={result.verdict === "pass" ? "border-gold/60" : undefined}>
        <h1 className="font-display text-2xl uppercase tracking-tight text-cream">
          {copy.emoji} {copy.title}
        </h1>
        <p className="mt-2 text-cream/70">{result.feedback}</p>

        {result.issues.length > 0 && (
          <ul className="mt-6 space-y-3">
            {result.issues.map((issue, i) => (
              <li key={i} className="rounded-xl border border-cream/10 p-4">
                <p className="font-semibold text-cream">{issue.question_ref}</p>
                <p className="text-sm text-cream/60">{issue.issue}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset}>Check another</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="font-display text-xl uppercase tracking-tight text-cream">
        Photo of your finished homework
      </h2>
      <p className="mt-1 text-cream/70">
        Make sure all your answers are visible in the photo.
      </p>

      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="Homework" className="mt-4 max-h-80 w-full rounded-xl object-cover" />
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

        {photo && (
          <Button disabled={phase === "submitting"} onClick={submit}>
            {phase === "submitting" ? "Checking…" : "Submit for verification (3 credits)"}
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
  );
}
