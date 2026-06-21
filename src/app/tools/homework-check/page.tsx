import { HomeworkCheckFlow } from "@/components/homework-check/homework-check-flow";

export default function HomeworkCheckPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Homework Check
      </h1>
      <p className="mt-2 text-cream/60">
        AI verifies it&apos;s really homework, checks it&apos;s complete, and spot-checks a few answers —
        3 credits.
      </p>
      <div className="mt-8">
        <HomeworkCheckFlow />
      </div>
    </main>
  );
}
