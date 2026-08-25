import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../src/generate/prisma", import.meta.url));
const destination = fileURLToPath(
  new URL("../dist/generate/prisma", import.meta.url),
);

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, force: true });
