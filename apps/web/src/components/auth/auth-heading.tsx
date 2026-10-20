interface AuthHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function AuthHeading({ eyebrow, title, description }: AuthHeadingProps) {
  return (
    <header className="mb-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-4 font-serif text-[clamp(2.1rem,4vw,3rem)] leading-[1.02] text-ink">
        {title}
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-soft">{description}</p>
    </header>
  );
}
