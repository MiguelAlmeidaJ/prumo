import { createPrismaClient } from "../src";
import { bootstrapAdmin } from "./seed/bootstrap-admin";

const prisma = createPrismaClient();

bootstrapAdmin(prisma)
  .then((result) => {
    console.log(
      result.created
        ? `Administrador inicial criado: ${result.admin.email}.`
        : `Bootstrap ignorado: já existe administrador (${result.admin.email}).`,
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
