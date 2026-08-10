import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import {
  readRefreshToken,
  removeRefreshToken,
  saveRefreshToken,
} from "./session-storage";

describe("armazenamento seguro da sessão", () => {
  beforeEach(async () => {
    await removeRefreshToken();
  });

  it("mantém o refresh token somente em memória no Expo web", async () => {
    await saveRefreshToken("refresh-token");
    expect(await readRefreshToken()).toBe("refresh-token");
    await removeRefreshToken();
    expect(await readRefreshToken()).toBeNull();
  });
});
