import { describe, expect, it } from "vitest";

import { calculateActionMenuPosition } from "./action-menu";

describe("calculateActionMenuPosition", () => {
  it("mantém o menu dentro das bordas horizontais da viewport", () => {
    expect(
      calculateActionMenuPosition(
        { top: 100, right: 70, bottom: 134 },
        { width: 320, height: 640 },
      ),
    ).toMatchObject({ left: 12, width: 220 });

    expect(
      calculateActionMenuPosition(
        { top: 100, right: 310, bottom: 134 },
        { width: 320, height: 640 },
      ).left,
    ).toBe(88);
  });

  it("abre acima quando não há espaço suficiente abaixo", () => {
    const position = calculateActionMenuPosition(
      { top: 560, right: 790, bottom: 594 },
      { width: 800, height: 600 },
      { width: 220, height: 180 },
    );

    expect(position.top).toBe(374);
    expect(position.maxHeight).toBe(542);
  });

  it("limita largura e altura em viewports pequenas", () => {
    const position = calculateActionMenuPosition(
      { top: 50, right: 150, bottom: 84 },
      { width: 180, height: 150 },
      { width: 220, height: 240 },
    );

    expect(position).toMatchObject({ left: 12, width: 156 });
    expect(position.maxHeight).toBeGreaterThanOrEqual(0);
    expect(position.top).toBeGreaterThanOrEqual(12);
  });
});
