import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { OperationalController } from "./operational.controller";

describe("OperationalController", () => {
  it("mantém liveness independente das dependências", () => {
    const controller = new OperationalController({} as never, {} as never);
    expect(controller.health()).toMatchObject({
      status: "ok",
      service: "prumo-api",
    });
  });

  it("retorna 503 quando uma dependência não está pronta", async () => {
    const report = {
      status: "not_ready" as const,
      timestamp: new Date().toISOString(),
      checks: {
        postgres: { status: "down" as const },
        redis: { status: "up" as const },
        queues: { status: "up" as const },
        storage: { status: "up" as const },
      },
    };
    const controller = new OperationalController(
      { readiness: vi.fn().mockResolvedValue(report) } as never,
      {} as never,
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
