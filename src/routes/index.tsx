import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Instagram, MapPin, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { eur, usePublicServices } from "@/lib/public-services";
import { cn } from "@/lib/utils";
import hero from "@/assets/hero.jpg";
import lashes2 from "@/assets/lashes-2.jpg";
import makeup1 from "@/assets/makeup-1.jpg";
import makeup2 from "@/assets/makeup-2.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aleksova Beauty Studio — Lashes & Makeup" },
      {
        name: "description",
        content:
          "Eyelash extensions and occasion makeup by Aleksova Beauty Studio. Request an appointment online.",
      },
      { property: "og:title", content: "Aleksova Beauty Studio — Lashes & Makeup" },
      {
        property: "og:description",
        content: "Eyelash extensions and occasion makeup. Request an appointment online.",
      },
    ],
  }),
  component: Home,
});

const IG = "https://www.instagram.com/aleksova.beauty.studio/";
const GALLERY = [
  { src: hero, cat: "lashes", alt: "Soft classic lash set, eyes closed" },
  { src: makeup1, cat: "makeup", alt: "Soft glam bridal makeup" },
  { src: lashes2, cat: "lashes", alt: "Volume lash set in profile" },
  { src: makeup2, cat: "makeup", alt: "Smoky taupe evening makeup" },
] as const;

function Home() {
  const { services, error } = usePublicServices();
  const [filter, setFilter] = useState<"all" | "lashes" | "makeup">("all");
  const items = GALLERY.filter((g) => filter === "all" || g.cat === filter);

  return (
    <div className="pb-20">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#top" className="font-serif text-2xl tracking-wide">
            Aleksova <span className="italic text-taupe">Beauty Studio</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm md:flex">
            <a href="#services" className="hover:text-taupe">
              Services
            </a>
            <a href="#portfolio" className="hover:text-taupe">
              Portfolio
            </a>
            <a href="#about" className="hover:text-taupe">
              About
            </a>
            <a href="#contact" className="hover:text-taupe">
              Contact
            </a>
          </nav>
          <Button asChild variant="hero" size="sm">
            <Link to="/book">Book</Link>
          </Button>
        </div>
      </header>

      <section
        id="top"
        className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 md:grid-cols-2 md:py-20"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-taupe">
            Lashes · Makeup
          </p>
          <h1 className="mt-4 text-5xl leading-[1.05] md:text-7xl">
            Soft, considered beauty — <em className="text-taupe">made for you.</em>
          </h1>
          <p className="mt-6 max-w-md text-muted-foreground">
            A calm, one-to-one studio for eyelash extensions and occasion makeup. Choose a service
            and a time, and I'll confirm your request personally.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="hero" size="xl">
              <Link to="/book">Book an appointment</Link>
            </Button>
            <Button asChild variant="ghost" size="xl">
              <a href="#services">View services</a>
            </Button>
          </div>
        </div>
        <img
          src={hero}
          alt="Natural lash extensions"
          width={1280}
          height={1600}
          className="aspect-[4/5] w-full rounded-t-full object-cover"
        />
      </section>

      <section id="services" className="border-y bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-16">
          <h2 className="text-center text-4xl md:text-5xl">Services</h2>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Prices and durations shown are demo data.
          </p>
          {error && <p className="mt-6 text-center text-sm text-muted-foreground">{error}</p>}
          <ul className="mt-10 divide-y">
            {services.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="text-2xl">{s.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                </div>
                <div className="flex items-center gap-5 sm:shrink-0">
                  <span className="text-sm text-muted-foreground">{s.duration} min</span>
                  <span className="font-serif text-2xl">{eur(s.price)}</span>
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link to="/book" search={{ service: s.id }}>
                      Book
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="portfolio" className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex flex-col items-center gap-5">
          <h2 className="text-4xl md:text-5xl">Portfolio</h2>
          <div
            role="tablist"
            aria-label="Filter portfolio"
            className="flex gap-1 rounded-full border bg-surface p-1"
          >
            {(["all", "lashes", "makeup"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "min-h-10 rounded-full px-5 text-sm capitalize",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map((g) => (
            <figure key={g.alt} className="overflow-hidden rounded-lg">
              <img
                src={g.src}
                alt={g.alt}
                loading="lazy"
                width={1024}
                height={1280}
                className="aspect-[4/5] w-full object-cover transition-transform duration-500 hover:scale-105"
              />
            </figure>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Placeholder images — replace with the studio's own work.
        </p>
      </section>

      <section id="about" className="bg-blush/40">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center">
          <h2 className="text-4xl md:text-5xl">The studio</h2>
          <p className="mt-6 text-sm text-muted-foreground">
            [Development placeholder: add the owner's introduction here.]
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="text-center text-4xl md:text-5xl">FAQ</h2>
        <Accordion type="single" collapsible className="mt-8">
          {(
            [
              [
                "How do I book?",
                "Choose a service and an available time. Your request reserves the time while it awaits approval.",
              ],
              ["Do I need an account?", "No. Just your name and phone number."],
              [
                "Can I cancel or reschedule?",
                "Contact the studio directly. Contact details and the cancellation policy are still being confirmed.",
              ],
            ] as const
          ).map(([q, a]) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger className="text-left text-base">{q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section id="contact" className="border-t bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-4xl md:text-5xl">Visit the studio</h2>
            <ul className="mt-6 space-y-3 text-sm opacity-90">
              <li className="flex gap-3">
                <MapPin className="h-5 w-5 shrink-0" /> [Development placeholder: studio address]
              </li>
              <li className="flex gap-3">
                <Phone className="h-5 w-5 shrink-0" /> [Development placeholder: studio phone]
              </li>
              <li className="flex gap-3">
                <Clock className="h-5 w-5 shrink-0" /> [Development sample hours: confirm before
                use]
              </li>
            </ul>
          </div>
          <div className="flex flex-col items-start justify-center gap-4">
            <a
              href={IG}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-lg underline-offset-4 hover:underline"
            >
              <Instagram className="h-5 w-5" /> @aleksova.beauty.studio
            </a>
            <Button asChild variant="blush" size="xl">
              <Link to="/book">Book an appointment</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
