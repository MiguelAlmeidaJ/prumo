import type { AuthResponse } from "@prumo/contracts";
import { NextRequest, NextResponse } from "next/server";

const REFRESH_COOKIE = "prumo_refresh";
const API_URL = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3333/api"
).replace(/\/$/, "");
const allowedActions = new Set([
  "login",
  "refresh",
  "logout",
  "select-tenant",
  "select-platform",
]);

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

function cookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/session",
    maxAge: 7 * 24 * 60 * 60,
  });
}

function clearCookie(response: NextResponse): void {
  response.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/session",
    maxAge: 0,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { message: "Origem não permitida." },
      { status: 403 },
    );
  }
  const { action } = await context.params;
  if (!allowedActions.has(action)) {
    return NextResponse.json(
      { message: "Ação não encontrada." },
      { status: 404 },
    );
  }

  const currentRefresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const incoming = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (action !== "login" && !currentRefresh) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  }

  const body =
    action === "login"
      ? incoming
      : action === "select-tenant"
        ? { tenantId: incoming.tenantId, refreshToken: currentRefresh }
        : { refreshToken: currentRefresh };
  const authorization = request.headers.get("authorization");
  const upstream = await fetch(`${API_URL}/auth/${action}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!upstream) {
    if (action === "logout") {
      const response = new NextResponse(null, { status: 204 });
      clearCookie(response);
      return response;
    }
    return NextResponse.json(
      { message: "Não foi possível conectar à API do Prumo." },
      { status: 503 },
    );
  }

  if (action === "logout") {
    const response = new NextResponse(null, {
      status: upstream.ok ? 204 : upstream.status,
    });
    clearCookie(response);
    return response;
  }

  const payload = (await upstream.json().catch(() => null)) as
    AuthResponse | { message?: string | string[] } | null;
  if (!upstream.ok || !payload || !("refreshToken" in payload)) {
    return NextResponse.json(payload ?? { message: "Falha na autenticação." }, {
      status: upstream.status,
    });
  }

  const { refreshToken, ...safeSession } = payload;
  const response = NextResponse.json({
    ...safeSession,
    refreshToken: "http-only",
  });
  cookie(response, refreshToken);
  return response;
}
