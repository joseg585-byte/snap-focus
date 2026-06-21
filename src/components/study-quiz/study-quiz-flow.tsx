"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const LENGTHS = [15, 25, 45] as const;

interface QuizQuestion {
  prompt: string;
  topic_tag: string;
}

interface GradeResult {
  score: number;
  total: number;
  pass: boolean;
  results: { correct: boolean; feedback: string }[];
  missedTopics: string[];
}

type Phase = "setup" | "starting" | "studying" | "loading_quiz" | "quiz" | "grading" | "result";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function StudyQuizFlow() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [lengthMinutes, setLengthMinutes] = useState<15 | 25 | 45>(25);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const endedRef = useRef(false);
  const loadQuizRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (phase !== "studying") return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1 && !endedRef.current) {
          endedRef.current = true;
          clearInterval(interval);
          loadQuizRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  async function startSession(e: React.FormEvent) {
    e.preventDefault();
    setPhase("starting");
    setError(null);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic: topic || undefined,
          length_minutes: lengthMinutes,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.suggestion || data.error || "Something went wrong.");
        setPhase("setup");
        return;
      }
      setSessionId(data.sessionId);
      endedRef.current = false;
      setRemainingSeconds(lengthMinutes * 60);
      setPhase("studying");
    } catch {
      setError("Network error — please try again.");
      setPhase("setup");
    }
  }

  async function loadQuiz() {
    setPhase("loading_quiz");
    try {
      const res = await fetch("/api/tutor/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Something went wrong.");
        return;
      }
      setQuestions(data.questions);
      setAnswers(data.questions.map(() => ""));
      setPhase("quiz");
    } catch {
      setError("Network error — please try again.");
    }
  }

  useEffect(() => {
    loadQuizRef.current = loadQuiz;
  });

  async function submitQuiz() {
    setPhase("grading");
    try {
      const res = await fetch("/api/tutor/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Something went wrong.");
        setPhase("quiz");
        return;
      }
      setGrade(data as GradeResult);
      setPhase("result");
    } catch {
      setError("Network error — please try again.");
      setPhase("quiz");
    }
  }

  function reset() {
    setPhase("setup");
    setSessionId(null);
    setQuestions([]);
    setAnswers([]);
    setGrade(null);
    setError(null);
  }

  if (phase === "setup" || phase === "starting") {
    return (
      <Card>
        <form onSubmit={startSession} className="space-y-5">
          <div>
            <label className="text-sm text-cream/70">What are you studying?</label>
            <input
              type="text"
              required
              placeholder="e.g. Math, Biology, World History"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-cream/70">Chapter / topic (optional)</label>
            <input
              type="text"
              placeholder="e.g. Chapter 7, the water cycle"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-cream/70">Study timer</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {LENGTHS.map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setLengthMinutes(min)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    lengthMinutes === min
                      ? "border-gold/60 bg-gold/10 text-cream"
                      : "border-cream/15 text-cream/70"
                  }`}
                >
                  {min} min
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {error?.toLowerCase().includes("credit") && (
            <Link href="/billing" className="block text-sm text-gold underline">
              Top up credits
            </Link>
          )}

          <Button type="submit" className="w-full" disabled={phase === "starting"}>
            {phase === "starting" ? "Starting…" : "Start studying (8 credits)"}
          </Button>
        </form>
      </Card>
    );
  }

  if (phase === "studying" || phase === "loading_quiz") {
    return (
      <Card className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-cream/50">Study session</p>
        <p className="mt-4 font-display text-6xl text-gold">{formatClock(remainingSeconds)}</p>
        <p className="mt-3 text-cream/70">
          Study {subject}
          {topic ? ` — ${topic}` : ""} using your own materials. When the timer ends, you&apos;ll get a
          5-question quiz to prove it.
        </p>
        {phase === "loading_quiz" && (
          <p className="mt-4 text-sm text-cream/50">Building your quiz…</p>
        )}
      </Card>
    );
  }

  if (phase === "quiz" || phase === "grading") {
    return (
      <Card>
        <h2 className="font-display text-xl uppercase tracking-tight text-cream">
          Quiz time — {subject}
        </h2>
        <p className="mt-1 text-cream/60">Answer all 5 to check what stuck. Need 4/5 to pass.</p>

        <div className="mt-5 space-y-5">
          {questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-cream/10 bg-ink p-5">
              <p className="text-sm uppercase tracking-wide text-cream/40">Question {i + 1}</p>
              <p className="mt-1 text-cream">{q.prompt}</p>
              <input
                type="text"
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))
                }
                placeholder="Your answer"
                className="mt-3 h-11 w-full rounded-lg border border-cream/15 bg-ink-soft px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
              />
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <Button
          className="mt-6 w-full"
          disabled={phase === "grading" || answers.some((a) => !a.trim())}
          onClick={submitQuiz}
        >
          {phase === "grading" ? "Grading…" : "Submit quiz"}
        </Button>
      </Card>
    );
  }

  if (phase === "result" && grade) {
    return (
      <Card className={grade.pass ? "border-gold/60" : undefined}>
        <h1 className="font-display text-2xl uppercase tracking-tight text-cream">
          {grade.pass ? "✅ You studied — verified!" : "Study again"}
        </h1>
        <p className="mt-2 text-cream/70">
          {grade.score}/{grade.total} correct.
        </p>

        <ul className="mt-6 space-y-3">
          {questions.map((q, i) => (
            <li key={i} className="rounded-xl border border-cream/10 p-4">
              <p className="font-semibold text-cream">
                {grade.results[i]?.correct ? "✓" : "✗"} {q.prompt}
              </p>
              <p className="text-sm text-cream/60">{grade.results[i]?.feedback}</p>
            </li>
          ))}
        </ul>

        {!grade.pass && grade.missedTopics.length > 0 && (
          <div className="mt-6 rounded-lg border border-gold/30 bg-gold/10 p-4">
            <p className="text-sm font-semibold text-gold">Restudy these topics:</p>
            <ul className="mt-2 list-inside list-disc text-sm text-cream/80">
              {grade.missedTopics.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset}>{grade.pass ? "New session" : "Study again"}</Button>
        </div>
      </Card>
    );
  }

  return null;
}
