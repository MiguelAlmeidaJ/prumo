import { BadRequestException, ConflictException } from "@nestjs/common";
import { Weekday } from "@prumo/database";
import { describe, expect, it } from "vitest";
import {
  ensureSameUtcDay,
  parseInterval,
  utcTime,
  weekdayOf,
} from "./schedule.utils";

describe("schedule utils", () => {
  it("interpreta intervalos e dias sempre em UTC", () => {
    const interval = parseInterval(
      "2035-01-08T08:00:00.000Z",
      "2035-01-08T09:00:00.000Z",
    );
    expect(weekdayOf(interval.start)).toBe(Weekday.MONDAY);
    expect(utcTime(interval.start)).toBe("08:00");
  });

  it("rejeita intervalo invertido", () => {
    expect(() =>
      parseInterval("2035-01-08T09:00:00.000Z", "2035-01-08T08:00:00.000Z"),
    ).toThrow(BadRequestException);
  });

  it("rejeita aula que atravessa a meia-noite UTC", () => {
    expect(() =>
      ensureSameUtcDay(
        new Date("2035-01-08T23:30:00.000Z"),
        new Date("2035-01-09T00:30:00.000Z"),
      ),
    ).toThrow(ConflictException);
  });
});
