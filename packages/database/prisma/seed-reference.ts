import { PrismaClient } from "@prisma/client";
import { runReferenceSeed } from "./seed/reference";

const prisma = new PrismaClient();

runReferenceSeed(prisma)
  .then(() => console.log("Seed de referência concluído."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
