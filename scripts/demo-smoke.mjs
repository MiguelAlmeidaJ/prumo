const apiUrl = (
  process.env.DEMO_API_URL ?? "http://localhost:3333/api"
).replace(/\/$/, "");
const password = process.env.SEED_ADMIN_PASSWORD ?? "PrumoDev@123";

const personas = [
  {
    email: "admin@prumo.local",
    expectedScope: "MANAGEMENT",
    label: "gestão",
  },
  {
    email: "carlos@exemplo.local",
    expectedScope: "INSTRUCTOR",
    label: "instrutor",
  },
  {
    email: "mariana@exemplo.local",
    expectedScope: "STUDENT",
    label: "aluno",
  },
];

function fail(message) {
  throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const detail =
      typeof body === "string" ? body : JSON.stringify(body ?? "sem resposta");
    fail(
      `${options.method ?? "GET"} ${path}: HTTP ${response.status} ${detail.slice(0, 300)}`,
    );
  }
  return body;
}

function collectionSize(body) {
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body?.data)) return body.data.length;
  if (Array.isArray(body?.items)) return body.items.length;
  if (typeof body?.meta?.total === "number") return body.meta.total;
  return null;
}

async function expectCollection(path, token, minimum = 1) {
  const body = await request(path, { token });
  const size = collectionSize(body);
  if (size === null) fail(`${path}: formato de coleção não reconhecido`);
  if (size < minimum)
    fail(`${path}: retornou ${size}, esperado ao menos ${minimum}`);
  return { path, records: size };
}

async function login(persona) {
  const session = await request("/auth/login", {
    method: "POST",
    body: { email: persona.email, password },
  });
  if (!session?.accessToken || !session?.refreshToken) {
    fail(`Login de ${persona.label}: tokens ausentes`);
  }
  if (!session.activeMembership?.tenant?.id) {
    fail(`Login de ${persona.label}: tenant ativo ausente`);
  }
  return session;
}

async function logout(refreshToken) {
  await request("/auth/logout", {
    method: "POST",
    body: { refreshToken },
  });
}

async function main() {
  const healthUrl = new URL(apiUrl);
  healthUrl.pathname = "/health";
  const health = await fetch(healthUrl);
  if (!health.ok) fail(`/health: HTTP ${health.status}`);

  const sessions = [];
  const profileChecks = [];
  try {
    for (const persona of personas) {
      const session = await login(persona);
      sessions.push(session);
      const [me, dashboard] = await Promise.all([
        request("/auth/me", { token: session.accessToken }),
        request("/dashboard", { token: session.accessToken }),
      ]);
      if (
        me?.activeMembership?.tenant?.id !== session.activeMembership.tenant.id
      ) {
        fail(`Perfil ${persona.label}: /auth/me retornou outro tenant`);
      }
      if (dashboard?.scope !== persona.expectedScope) {
        fail(
          `Perfil ${persona.label}: dashboard ${dashboard?.scope ?? "ausente"}, esperado ${persona.expectedScope}`,
        );
      }
      if (!Array.isArray(dashboard.metrics) || dashboard.metrics.length === 0) {
        fail(`Perfil ${persona.label}: dashboard sem métricas`);
      }
      profileChecks.push({
        profile: persona.label,
        scope: dashboard.scope,
        metrics: dashboard.metrics.length,
        upcoming: dashboard.upcoming?.length ?? 0,
      });
    }

    const ownerToken = sessions[0].accessToken;
    const collections = await Promise.all([
      expectCollection("/students?pageSize=100", ownerToken, 6),
      expectCollection("/instructors?pageSize=100", ownerToken, 2),
      expectCollection("/vehicles?pageSize=100", ownerToken, 3),
      expectCollection("/units?pageSize=100", ownerToken, 2),
      expectCollection("/practical-lessons", ownerToken, 6),
      expectCollection("/theoretical-classes", ownerToken, 3),
      expectCollection("/exams?pageSize=100", ownerToken, 4),
      expectCollection("/receivables?pageSize=100", ownerToken, 10),
      expectCollection("/payments?pageSize=100", ownerToken, 3),
      expectCollection("/expenses?pageSize=100", ownerToken, 3),
      expectCollection("/communication/campaigns", ownerToken, 2),
      expectCollection("/notifications", ownerToken, 1),
    ]);
    const financialDashboard = await request("/financial/dashboard", {
      token: ownerToken,
    });
    if (!financialDashboard || typeof financialDashboard !== "object") {
      fail("/financial/dashboard: resposta ausente");
    }

    console.log("Smoke test da autoescola demo concluído com sucesso.");
    console.table(profileChecks);
    console.table(collections);
  } finally {
    await Promise.allSettled(
      sessions.map((session) => logout(session.refreshToken)),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
