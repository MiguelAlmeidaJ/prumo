import { createPrismaClient } from "../src";
import { runReferenceSeed } from "./seed/reference";

const prisma = createPrismaClient();

runReferenceSeed(prisma)
  .then(() => console.log("Seed de referência concluído."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
