"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TranscriptEntry {
  role: "coach" | "user";
  text: string;
  at: string;
}

interface SessionBlock {
  topic: string;
  activity: string;
  minutes: number;
}

interface SessionReport {
  summary: string;
  covered: string[];
  strong_areas: string[];
  weak_areas: string[];
  next_session_suggestion: string;
}

type Mode = "coached" | "just_focus";

const DURATIONS = [25, 45, 90] as const;
const FOCUS_LEVELS: { value: "light" | "heavy"; label: string }[] = [
  { value: "light", label: "Light coaching" },
  { value: "heavy", label: "Heavy coaching" },
];

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function FocusSessionFlow() {
  const [phase, setPhase] = useState<"setup" | "running" | "ending" | "result">("setup");
  const [mode, setMode] = useState<Mode>("coached");
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [duration, setDuration] = useState<25 | 45 | 90>(45);
  const [focusLevel, setFocusLevel] = useState<"light" | "heavy">("light");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [reply, setReply] = useState("");
  const [reflection, setReflection] = useState<string | null>(null);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [blockIndex, setBlockIndex] = useState(0);

  const lastCheckinMinuteRef = useRef(0);
  const endedRef = useRef(false);

  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (mode === "just_focus") {
          const elapsedSeconds = duration * 60 - next;
          const elapsedMinutes = Math.floor(elapsedSeconds / 60);
          if (
            elapsedMinutes > 0 &&
            elapsedMinutes % 5 === 0 &&
            elapsedMinutes !== lastCheckinMinuteRef.current &&
            next > 0
          ) {
            lastCheckinMinuteRef.current = elapsedMinutes;
            void runJustFocusCheckin(elapsedMinutes);
          }
        }
        if (next <= 0 && !endedRef.current) {
          endedRef.current = true;
          void handleEnd();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "coached" && !subject.trim()) {
      setError("Tell us what subject you're studying.");
      return;
    }
    if (mode === "just_focus" && !goal.trim()) {
      setError("Tell us what you're working on.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/master-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          subject: mode === "coached" ? subject : undefined,
          goal: goal || undefined,
          lengthMinutes: duration,
          focusLevel: mode === "just_focus" ? focusLevel : undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Couldn't start the session.");
        return;
      }
      setSessionId(data.sessionId);
      setRemainingSeconds(duration * 60);
      lastCheckinMinuteRef.current = 0;
      endedRef.current = false;
      setReflection(null);
      setReport(null);

      if (data.mode === "coached") {
        setBlocks(data.blocks);
        setBlockIndex(0);
        setTranscript([]);
        setPhase("running");
        void runTeachingTurn(data.sessionId, 0);
      } else {
        setTranscript([{ role: "coach", text: data.kickoff, at: new Date().toISOString() }]);
        setPhase("running");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runTeachingTurn(sid: string, index: number, userMessage?: string) {
    setStreaming(true);
    setStreamingText("");
    try {
      const res = await fetch("/api/master-coach/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, blockIndex: index, userMessage }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value);
        setStreamingText(full);
      }
      setTranscript((prev) => [...prev, { role: "coach", text: full, at: new Date().toISOString() }]);
    } finally {
      setStreaming(false);
      setStreamingText("");
    }
  }

  async function runJustFocusCheckin(elapsedMinutes: number, userResponse?: string) {
    if (!sessionId) return;
    setStreaming(true);
    setStreamingText("");
    try {
      const res = await fetch("/api/master-coach/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, goal, focusLevel, elapsedMinutes, userResponse }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value);
        setStreamingText(full);
      }
      setTranscript((prev) => [...prev, { role: "coach", text: full, at: new Date().toISOString() }]);
    } finally {
      setStreaming(false);
      setStreamingText("");
    }
  }

  function sendReply() {
    if (!reply.trim() || !sessionId) return;
    const text = reply.trim();
    setReply("");
    setTranscript((prev) => [...prev, { role: "user", text, at: new Date().toISOString() }]);
    if (mode === "coached") {
      void runTeachingTurn(sessionId, blockIndex, text);
    } else {
      const elapsedMinutes = Math.floor((duration * 60 - remainingSeconds) / 60);
      void runJustFocusCheckin(elapsedMinutes, text);
    }
  }

  function nextBlock() {
    if (!sessionId) return;
    if (blockIndex + 1 >= blocks.length) {
      if (!endedRef.current) {
        endedRef.current = true;
        void handleEnd();
      }
      return;
    }
    const next = blockIndex + 1;
    setBlockIndex(next);
    void runTeachingTurn(sessionId, next);
  }

  async function handleEnd() {
    setPhase("ending");
    try {
      const res = await fetch("/api/master-coach/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, transcript }),
      });
      const data = await res.json();
      if (data.mode === "coached") {
        setReport(data.report ?? null);
      } else {
        setReflection(data.reflection ?? "Session complete.");
      }
    } catch {
      setReflection("Session complete. (Couldn't generate a summary — network error.)");
    } finally {
      setPhase("result");
    }
  }

  // ---------- SETUP ----------
  if (phase === "setup") {
    return (
      <Card>
        <form onSubmit={handleStart} className="space-y-5">
          <div>
            <label className="text-sm text-cream/70">Session type</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("coached")}
                className={`h-11 rounded-lg border text-sm ${
                  mode === "coached" ? "border-gold/60 bg-gold/10 text-cream" : "border-cream/15 text-cream/70"
                }`}
              >
                Coached study
              </button>
              <button
                type="button"
                onClick={() => setMode("just_focus")}
                className={`h-11 rounded-lg border text-sm ${
                  mode === "just_focus" ? "border-gold/60 bg-gold/10 text-cream" : "border-cream/15 text-cream/70"
                }`}
              >
                Just Focus
              </button>
            </div>
          </div>

          {mode === "coached" ? (
            <div>
              <label className="text-sm text-cream/70">What subject are you studying?</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Calculus II, Organic Chemistry, Spanish grammar"
                className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="text-sm text-cream/70">What are you working on?</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Finishing my essay outline"
                className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
              />
            </div>
          )}

          {mode === "coached" && (
            <div>
              <label className="text-sm text-cream/70">Specific goal (optional)</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Get ready for Friday's derivatives quiz"
                className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-cream/70">Duration</label>
            <div className="mt-2 flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`h-10 flex-1 rounded-lg border text-sm ${
                    duration === d
                      ? "border-gold/60 bg-gold/10 text-cream"
                      : "border-cream/15 text-cream/70"
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          {mode === "just_focus" && (
            <div>
              <label className="text-sm text-cream/70">Focus level</label>
              <div className="mt-2 flex gap-2">
                {FOCUS_LEVELS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFocusLevel(f.value)}
                    className={`h-10 flex-1 rounded-lg border text-sm ${
                      focusLevel === f.value
                        ? "border-gold/60 bg-gold/10 text-cream"
                        : "border-cream/15 text-cream/70"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? "Starting…"
              : mode === "coached"
                ? "Start session (10 credits)"
                : "Start session (5 credits)"}
          </Button>
        </form>
      </Card>
    );
  }

  // ---------- RUNNING ----------
  if (phase === "running" || phase === "ending") {
    const currentBlock = mode === "coached" ? blocks[blockIndex] : null;
    return (
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-cream/50">{mode === "coached" ? subject : "Working on"}</p>
            <p className="text-cream">{mode === "coached" ? currentBlock?.topic : goal}</p>
          </div>
          <div className="font-display text-3xl text-gold">{formatClock(remainingSeconds)}</div>
        </div>

        {mode === "coached" && blocks.length > 0 && (
          <>
            <div className="mt-4 flex items-center gap-2">
              {blocks.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i <= blockIndex ? "bg-gold" : "bg-cream/15"}`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cream/50">
              Block {blockIndex + 1} of {blocks.length} · {currentBlock?.activity}
            </p>
          </>
        )}

        <div className="mt-5 max-h-96 space-y-3 overflow-y-auto rounded-xl border border-cream/10 bg-ink p-4">
          {transcript.map((t, i) => (
            <div key={i} className={t.role === "coach" ? "text-cream" : "text-right text-gold"}>
              <p className="text-xs uppercase tracking-wide text-cream/40">
                {t.role === "coach" ? "Coach" : "You"}
              </p>
              <p className="whitespace-pre-wrap text-sm">{t.text}</p>
            </div>
          ))}
          {streaming && (
            <div className="text-cream">
              <p className="text-xs uppercase tracking-wide text-cream/40">Coach</p>
              <p className="whitespace-pre-wrap text-sm">{streamingText || "…"}</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder={mode === "coached" ? "Your answer or question…" : "Quick response (or just keep working)…"}
            className="h-11 flex-1 rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
          />
          <Button variant="outline" onClick={sendReply} disabled={streaming}>
            Send
          </Button>
        </div>

        {mode === "coached" && (
          <Button className="mt-3 w-full" onClick={nextBlock} disabled={streaming || phase === "ending"}>
            {blockIndex + 1 >= blocks.length ? "Finish session" : "Next topic →"}
          </Button>
        )}

        <Button
          variant="ghost"
          className="mt-4 w-full"
          disabled={phase === "ending"}
          onClick={() => {
            if (!endedRef.current) {
              endedRef.current = true;
              void handleEnd();
            }
          }}
        >
          {phase === "ending" ? "Wrapping up…" : "End session early"}
        </Button>
      </Card>
    );
  }

  // ---------- RESULT ----------
  return (
    <Card>
      <h2 className="font-display text-xl uppercase tracking-tight text-cream">
        Session complete
      </h2>

      {report ? (
        <div className="mt-4 space-y-4">
          <p className="text-cream/80">{report.summary}</p>
          {report.covered.length > 0 && (
            <div>
              <p className="text-sm uppercase tracking-wide text-cream/40">Covered</p>
              <ul className="mt-1 list-inside list-disc text-sm text-cream/80">
                {report.covered.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {report.strong_areas.length > 0 && (
              <div>
                <p className="text-sm uppercase tracking-wide text-emerald-400/70">Strong areas</p>
                <ul className="mt-1 list-inside list-disc text-sm text-cream/80">
                  {report.strong_areas.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.weak_areas.length > 0 && (
              <div>
                <p className="text-sm uppercase tracking-wide text-gold/80">Needs work</p>
                <ul className="mt-1 list-inside list-disc text-sm text-cream/80">
                  {report.weak_areas.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {report.next_session_suggestion && (
            <p className="text-sm text-cream/70">
              <span className="text-cream/40">Next time: </span>
              {report.next_session_suggestion}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-cream/80">{reflection}</p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => window.location.reload()}>Start another session</Button>
        <a href="/tools/focus/history" className="text-sm text-gold underline">
          View history
        </a>
      </div>
    </Card>
  );
}
