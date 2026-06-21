"use client";

import { useState } from "react";
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

interface LessonQuestion {
  prompt: string;
}

interface TutorResult {
  ok: true;
  balance: number;
  lessonId: string;
  title: string;
  questions: LessonQuestion[];
}

interface QuestionState {
  workShown: string;
  answer: string;
  submitting: boolean;
  error: string | null;
  lastVerdict: "correct" | "incorrect" | "blocked" | null;
  lastFeedback: string | null;
  attemptsRemaining: number;
  escalateToParent: boolean;
}

function freshQuestionState(): QuestionState {
  return {
    workShown: "",
    answer: "",
    submitting: false,
    error: null,
    lastVerdict: null,
    lastFeedback: null,
    attemptsRemaining: 3,
    escalateToParent: false,
  };
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
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([]);

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
      const lesson = data as TutorResult;
      setResult(lesson);
      setQuestionStates(lesson.questions.map(() => freshQuestionState()));
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateQuestion(index: number, patch: Partial<QuestionState>) {
    setQuestionStates((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  async function submitAnswer(index: number) {
    if (!result) return;
    const q = questionStates[index];
    if (!q.answer.trim()) return;

    updateQuestion(index, { submitting: true, error: null });
    try {
      const res = await fetch("/api/tutor/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: result.lessonId,
          question_index: index,
          work_shown: q.workShown,
          answer: q.answer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        updateQuestion(index, { submitting: false, error: data.message || data.error || "Something went wrong." });
        return;
      }
      updateQuestion(index, {
        submitting: false,
        lastVerdict: data.verdict,
        lastFeedback: data.feedback,
        attemptsRemaining: data.attempts_remaining,
        escalateToParent: data.escalate_to_parent,
      });
    } catch {
      updateQuestion(index, { submitting: false, error: "Network error — please try again." });
    }
  }

  function startOver() {
    setResult(null);
    setQuestionStates([]);
    setError(null);
  }

  if (result) {
    return (
      <Card>
        <h2 className="font-display text-xl uppercase tracking-tight text-cream">{result.title}</h2>

        <div className="mt-5 space-y-5">
          {result.questions.map((question, i) => {
            const qs = questionStates[i];
            const solved = qs.lastVerdict === "correct";
            const blocked = qs.lastVerdict === "blocked";
            const locked = solved || blocked;

            return (
              <div key={i} className="rounded-xl border border-cream/10 bg-ink p-5">
                <p className="text-sm uppercase tracking-wide text-cream/40">Question {i + 1}</p>
                <p className="mt-1 text-cream">{question.prompt}</p>

                {!locked && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="text-sm text-cream/70">Show your work</label>
                      <textarea
                        value={qs.workShown}
                        onChange={(e) => updateQuestion(i, { workShown: e.target.value })}
                        rows={3}
                        placeholder="Walk through how you got your answer…"
                        className="mt-1 w-full rounded-lg border border-cream/15 bg-ink-soft px-3 py-2 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-cream/70">Your answer</label>
                      <input
                        type="text"
                        value={qs.answer}
                        onChange={(e) => updateQuestion(i, { answer: e.target.value })}
                        className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink-soft px-3 text-cream focus:border-gold/60 focus:outline-none"
                      />
                    </div>

                    {qs.escalateToParent && (
                      <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-sm text-gold">
                        Having trouble? Let&apos;s get a parent to help with this one.
                        <Button variant="outline" className="mt-2 w-full" disabled>
                          Ask a parent for help
                        </Button>
                      </div>
                    )}

                    {qs.error && <p className="text-sm text-red-400">{qs.error}</p>}

                    <Button onClick={() => submitAnswer(i)} disabled={qs.submitting || !qs.answer.trim()}>
                      {qs.submitting ? "Checking…" : "Submit answer"}
                    </Button>
                  </div>
                )}

                {qs.lastFeedback && (
                  <p
                    className={`mt-4 text-sm ${
                      solved ? "text-emerald-400" : blocked ? "text-gold" : "text-cream/70"
                    }`}
                  >
                    {solved ? "✅ " : blocked ? "⏸ " : "❌ "}
                    {qs.lastFeedback}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={startOver}>Generate another lesson</Button>
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
          {submitting ? "Generating…" : "Generate (12 credits)"}
        </Button>
      </form>
    </Card>
  );
}
