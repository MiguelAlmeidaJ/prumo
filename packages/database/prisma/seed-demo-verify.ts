import { createPrismaClient } from "../src";

import { verifyDemoScenario } from "./seed/demo-scenario";

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "autoescola-demonstracao" },
  });
  if (!tenant) {
    throw new Error(
      "Autoescola Demonstração não encontrada. Execute pnpm db:seed:demo.",
    );
  }
  const result = await verifyDemoScenario(prisma, tenant.id);
  console.log("Cenário demo validado com sucesso.", result);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
