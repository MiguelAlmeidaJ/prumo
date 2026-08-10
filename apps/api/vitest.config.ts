import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // As suítes E2E compartilham a mesma instância PostgreSQL e executam
    // limpeza transacional. Arquivos paralelos criam deadlocks artificiais.
    fileParallelism: false,
  },
});
