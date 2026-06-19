"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SUBJECTS = ["Math", "Science", "History", "English", "Other"];
const GRADES = ["K", ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
const GOALS: { value: string; label: string }[] = [
  { value: "learn_concept", label: "Learn concept" },
  { value: "practice_problems", label: "Practice problems" },
  { value: "test_prep", label: "Test prep" },
  { value: "quick_reference", label: "Quick reference" },
];

interface TutorResult {
  ok: true;
  balance: number;
  plan: string;
  title: string;
  savedId: string | null;
}

export function TutorFlow() {
  const [subject, setSubject] = useState("Math");
  const [customSubject, setCustomSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("5");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("learn_concept");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TutorResult | null>(null);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject === "Other" ? customSubject || "Other" : subject,
          gradeLevel,
          topic,
          goal,
          notes: notes || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.suggestion || data.error || "Something went wrong.");
        return;
      }
      setResult(data as TutorResult);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.plan);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (result) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl uppercase tracking-tight text-cream">
            {result.title}
          </h2>
        </div>
        <div
          ref={printRef}
          className="mt-4 whitespace-pre-wrap rounded-xl border border-cream/10 bg-ink p-5 text-sm leading-relaxed text-cream/90"
        >
          {result.plan}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? "Copied ✓" : "Copy"}
          </Button>
          <Button variant="outline" disabled>
            {result.savedId ? "Saved to Library ✓" : "Save to My Library"}
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            Print
          </Button>
          <Button onClick={() => setResult(null)}>Generate another</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="text-sm text-cream/70">Subject</label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream focus:border-gold/60 focus:outline-none"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {subject === "Other" && (
            <input
              type="text"
              placeholder="Custom subject"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
            />
          )}
        </div>

        <div>
          <label className="text-sm text-cream/70">Grade level</label>
          <select
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream focus:border-gold/60 focus:outline-none"
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-cream/70">Topic</label>
          <input
            type="text"
            required
            placeholder="e.g. Long division, the water cycle, the Civil War"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-sm text-cream/70">Goal</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {GOALS.map((g) => (
              <label
                key={g.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  goal === g.value
                    ? "border-gold/60 bg-gold/10 text-cream"
                    : "border-cream/15 text-cream/70"
                }`}
              >
                <input
                  type="radio"
                  name="goal"
                  value={g.value}
                  checked={goal === g.value}
                  onChange={() => setGoal(g.value)}
                  className="accent-gold"
                />
                {g.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-cream/70">Special needs / notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the AI should know — IEP accommodations, reading level, etc."
            className="mt-1 w-full rounded-lg border border-cream/15 bg-ink px-3 py-2 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Generating…" : "Generate (2 credits)"}
        </Button>
      </form>
    </Card>
  );
}
