"use client";

import type { PropsWithChildren } from "react";
import { useAuth } from "@/auth/auth-context";

export function PlatformOwnerGate({ children }: PropsWithChildren) {
  const { session } = useAuth();
  if (session?.platform?.role !== "PLATFORM_OWNER") {
    return (
      <section className="platform-page">
        <div className="platform-error">
          Esta área é exclusiva do Proprietário da Plataforma.
        </div>
      </section>
    );
  }
  return children;
}
