import { spawnSync } from "node:child_process";

const acceptedRisks = new Map([
  [
    "GHSA-w3rx-r6r6-pgpr",
    {
      module: "image-size",
      version: "1.2.1",
      expiresOn: "2026-09-30",
      reason:
        "Dependência transitiva do Metro, executada somente sobre assets locais durante desenvolvimento/build; image-size 2.0.3 ainda não foi publicada.",
    },
  ],
  [
    "GHSA-5p2g-fcmc-qvqq",
    {
      module: "image-size",
      version: "1.2.1",
      expiresOn: "2026-09-30",
      reason:
        "Dependência transitiva do Metro, executada somente sobre assets locais durante desenvolvimento/build; image-size 2.0.3 ainda não foi publicada.",
    },
  ],
]);

const pnpmEntry = process.env.npm_execpath;
const audit = spawnSync(
  pnpmEntry ? process.execPath : "pnpm",
  pnpmEntry ? [pnpmEntry, "audit", "--json"] : ["audit", "--json"],
  {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  },
);

if (!audit.stdout) {
  console.error(audit.stderr || "A auditoria não retornou resultados.");
  process.exit(1);
}

let result;
try {
  result = JSON.parse(audit.stdout);
} catch {
  console.error("Não foi possível interpretar a saída de pnpm audit.");
  process.exit(1);
}

const blocking = [];
const accepted = [];
for (const advisory of Object.values(result.advisories ?? {})) {
  if (!["high", "critical"].includes(advisory.severity)) continue;
  const exception = acceptedRisks.get(advisory.github_advisory_id);
  const findings = advisory.findings ?? [];
  const scopedToMetro = findings.every((finding) =>
    finding.paths.every((path) => path.includes(">metro>image-size")),
  );
  const expectedVersion = findings.every(
    (finding) => finding.version === exception?.version,
  );
  const exceptionValid =
    exception &&
    advisory.module_name === exception.module &&
    expectedVersion &&
    scopedToMetro &&
    new Date(`${exception.expiresOn}T23:59:59.999Z`) >= new Date();

  if (exceptionValid) {
    accepted.push({ advisory, exception });
  } else {
    blocking.push(advisory);
  }
}

for (const { advisory, exception } of accepted) {
  console.warn(
    `RISCO ACEITO ${advisory.github_advisory_id} (${advisory.module_name}): ${exception.reason} Revisar até ${exception.expiresOn}.`,
  );
}

if (blocking.length) {
  for (const advisory of blocking) {
    console.error(
      `BLOQUEIO ${advisory.severity.toUpperCase()} ${advisory.github_advisory_id}: ${advisory.module_name} — ${advisory.title}`,
    );
  }
  process.exit(1);
}

const counts = result.metadata?.vulnerabilities ?? {};
console.log(
  `Auditoria aprovada: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high (${accepted.length} riscos formalmente aceitos), ${counts.moderate ?? 0} moderate.`,
);
