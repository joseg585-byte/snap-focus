"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TranscriptEntry {
  role: "coach" | "user";
  text: string;
  at: string;
}

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
  const [goal, setGoal] = useState("");
  const [duration, setDuration] = useState<25 | 45 | 90>(25);
  const [focusLevel, setFocusLevel] = useState<"light" | "heavy">("light");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [reply, setReply] = useState("");
  const [reflection, setReflection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lastCheckinMinuteRef = useRef(0);
  const endedRef = useRef(false);

  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        const elapsedSeconds = duration * 60 - next;
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        if (
          elapsedMinutes > 0 &&
          elapsedMinutes % 5 === 0 &&
          elapsedMinutes !== lastCheckinMinuteRef.current &&
          next > 0
        ) {
          lastCheckinMinuteRef.current = elapsedMinutes;
          void runCheckin(elapsedMinutes);
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
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/master-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          durationMinutes: duration,
          focusLevel,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Couldn't start the session.");
        return;
      }
      setSessionId(data.sessionId);
      setTranscript([{ role: "coach", text: data.kickoff, at: new Date().toISOString() }]);
      setRemainingSeconds(duration * 60);
      lastCheckinMinuteRef.current = 0;
      endedRef.current = false;
      setPhase("running");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runCheckin(elapsedMinutes: number, userResponse?: string) {
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
    if (!reply.trim()) return;
    const text = reply.trim();
    setReply("");
    setTranscript((prev) => [...prev, { role: "user", text, at: new Date().toISOString() }]);
    const elapsedMinutes = Math.floor((duration * 60 - remainingSeconds) / 60);
    void runCheckin(elapsedMinutes, text);
  }

  async function handleEnd() {
    setPhase("ending");
    try {
      const res = await fetch("/api/master-coach/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, goal, transcript }),
      });
      const data = await res.json();
      setReflection(data.reflection ?? "Session complete.");
    } catch {
      setReflection("Session complete. (Couldn't generate a reflection — network error.)");
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
            <label className="text-sm text-cream/70">What are you working on?</label>
            <input
              type="text"
              required
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Finishing my essay outline"
              className="mt-1 h-11 w-full rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
            />
          </div>
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
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Starting…" : "Start session (20 credits)"}
          </Button>
        </form>
      </Card>
    );
  }

  // ---------- RUNNING ----------
  if (phase === "running" || phase === "ending") {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-cream/50">Working on</p>
            <p className="text-cream">{goal}</p>
          </div>
          <div className="font-display text-3xl text-gold">{formatClock(remainingSeconds)}</div>
        </div>

        <div className="mt-5 max-h-96 space-y-3 overflow-y-auto rounded-xl border border-cream/10 bg-ink p-4">
          {transcript.map((t, i) => (
            <div key={i} className={t.role === "coach" ? "text-cream" : "text-right text-gold"}>
              <p className="text-xs uppercase tracking-wide text-cream/40">
                {t.role === "coach" ? "Coach" : "You"}
              </p>
              <p className="text-sm">{t.text}</p>
            </div>
          ))}
          {streaming && (
            <div className="text-cream">
              <p className="text-xs uppercase tracking-wide text-cream/40">Coach</p>
              <p className="text-sm">{streamingText || "…"}</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder="Quick response (or just keep working)…"
            className="h-11 flex-1 rounded-lg border border-cream/15 bg-ink px-3 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
          />
          <Button variant="outline" onClick={sendReply}>
            Send
          </Button>
        </div>

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
      <p className="mt-3 whitespace-pre-wrap text-cream/80">{reflection}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => window.location.reload()}>Start another session</Button>
        <a href="/tools/focus/history" className="text-sm text-gold underline">
          View history
        </a>
      </div>
    </Card>
  );
}
