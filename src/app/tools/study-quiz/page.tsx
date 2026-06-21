import { StudyQuizFlow } from "@/components/study-quiz/study-quiz-flow";

export default function StudyQuizPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Study Quiz
      </h1>
      <p className="mt-2 text-cream/60">
        Declare your subject, study through a Pomodoro timer with your own materials, then pass a
        5-question quiz to prove it stuck — 8 credits.
      </p>
      <div className="mt-8">
        <StudyQuizFlow />
      </div>
    </main>
  );
}
