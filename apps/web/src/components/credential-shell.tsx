import Link from "next/link";
import type { PropsWithChildren } from "react";

export function CredentialShell({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description: string }>) {
  return (
    <main className="credential-page">
      <section className="credential-card">
        <Link className="credential-brand" href="/" aria-label="Prumo">
          <span aria-hidden="true">P</span>
          PRUMO
        </Link>
        <div className="credential-card__heading">
          <span className="eyebrow">Acesso seguro</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
