import { TutorFlow } from "@/components/tutor/tutor-flow";

export default function TutorPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Standard Tutor
      </h1>
      <p className="mt-2 text-cream/60">
        Generate a graded practice set tailored to your kid, subject, and grade level — 12 credits,
        covers grading and retries.
      </p>
      <div className="mt-8">
        <TutorFlow />
      </div>
    </main>
  );
}
