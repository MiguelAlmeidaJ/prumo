import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports a healthy API with a UTC timestamp", () => {
    const result = new HealthController().check();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("prumo-api");
    expect(result.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});
