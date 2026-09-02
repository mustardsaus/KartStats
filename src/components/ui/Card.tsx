import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface", className)}>{children}</div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p
            className="bleed-in font-hud text-xs font-bold tracking-[0.25em] text-text-faint uppercase mb-1"
            style={{ animationDuration: "1.1s" }}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className="bleed-in bleed-in-display font-display text-2xl sm:text-3xl tracking-wide text-text"
          style={{ animationDuration: "1.4s", animationDelay: "80ms" }}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
