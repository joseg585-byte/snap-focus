import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KID_TOOLS, TIERS, TOPUP_PACKS, dollars } from "@/lib/config";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- HERO ---------- */}
      <section className="brand-glow relative overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-6 pt-20 pb-16 text-center sm:pt-28">
          <Badge>SeJo Labs</Badge>
          <h1 className="mt-6 font-display text-5xl uppercase leading-[0.95] tracking-tight text-cream sm:text-7xl">
            Snap<span className="text-gold">Focus</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl font-serif text-2xl leading-snug text-cream/80 sm:text-3xl">
            AI-verified accountability for kids.
            <br />
            No more &ldquo;I did it&rdquo; lies.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg">Get started — your kids will hate it</Button>
            <Button size="lg" variant="outline">
              See how it works
            </Button>
          </div>
          <p className="mt-4 text-sm text-cream/50">
            Every plan runs on credits — no surprise bills.
          </p>
        </div>
      </section>

      {/* ---------- FEATURES ---------- */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
          Three tools. Zero excuses.
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {KID_TOOLS.map((f) => (
            <Card key={f.action}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {f.emoji} {f.name}
                  </CardTitle>
                  <Badge>{typeof f.cost === "number" ? `${f.cost} credits` : f.cost}</Badge>
                </div>
              </CardHeader>
              <CardContent>{f.blurb}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- TIERS ---------- */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="text-center">
          <h2 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
            Pick your plan
          </h2>
          <p className="mt-3 font-serif text-xl text-cream/70">
            Flat monthly fee. Credits refill every month.
          </p>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <Card key={tier.id} highlighted={tier.highlight} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  {tier.highlight && <Badge>Most popular</Badge>}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl text-gold">
                    {dollars(tier.priceCents)}
                  </span>
                  <span className="text-cream/50">/mo</span>
                </div>
                <p className="text-sm text-cream/60">{tier.blurb}</p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="space-y-2.5 text-sm">
                  {tier.features.map((feat) => (
                    <li key={feat} className="flex gap-2.5">
                      <span className="mt-px text-gold">✦</span>
                      <span className="text-cream/80">{feat}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={tier.highlight ? "primary" : "outline"}
                >
                  Choose {tier.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- TOP-UPS ---------- */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="text-center">
          <h2 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
            Need more credits?
          </h2>
          <p className="mt-3 font-serif text-xl text-cream/70">
            One-time top-ups. No subscription change required.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {TOPUP_PACKS.map((pack) => (
            <Card key={pack.id} className="text-center">
              <CardTitle className="text-xl">{pack.name}</CardTitle>
              <div className="mt-2 font-display text-3xl text-gold">
                {pack.credits.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-cream/50">
                credits
              </div>
              <p className="mt-3 text-sm text-cream/60">{pack.blurb}</p>
              <Button variant="outline" className="mt-5 w-full">
                {dollars(pack.priceCents)}
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="mt-auto border-t border-cream/10">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-cream/50 sm:flex-row">
          <span className="font-display text-lg uppercase tracking-tight text-cream">
            Snap<span className="text-gold">Focus</span>
          </span>
          <Link href="/tools/focus" className="text-cream/40 hover:text-cream/70">
            Adult Study Coach (beta)
          </Link>
          <span>© {new Date().getFullYear()} SeJo Labs. Built to go native.</span>
        </div>
      </footer>
    </main>
  );
}
