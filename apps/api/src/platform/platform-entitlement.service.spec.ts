import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlatformEntitlementService } from "./platform-entitlement.service";

function serviceWithUsage(usage: {
  memberships: number;
  students: number;
  units: number;
}) {
  const prisma = {
    tenantSubscription: {
      findFirst: vi.fn().mockResolvedValue({
        plan: {
          id: "plan",
          code: "TEST",
          name: "Teste",
          maxUsers: 1,
          maxStudents: 1,
          maxUnits: 1,
          maxInstructors: 1,
          maxVehicles: 1,
          maxStorageBytes: null,
          features: { FINANCIAL: true, MOBILE_APP: false },
        },
      }),
    },
    membership: { count: vi.fn().mockResolvedValue(usage.memberships) },
    student: { count: vi.fn().mockResolvedValue(usage.students) },
    schoolUnit: { count: vi.fn().mockResolvedValue(usage.units) },
    instructor: { count: vi.fn().mockResolvedValue(0) },
    vehicle: { count: vi.fn().mockResolvedValue(0) },
  };
  return new PlatformEntitlementService(prisma as never);
}

describe("PlatformEntitlementService", () => {
  it("bloqueia criação ao atingir o limite do plano", async () => {
    const service = serviceWithUsage({
      memberships: 1,
      students: 1,
      units: 1,
    });
    await expect(
      service.assertCanCreate("tenant", "students"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("resolve feature flags sem espalhar regras nos controllers", async () => {
    const service = serviceWithUsage({
      memberships: 0,
      students: 0,
      units: 0,
    });
    await expect(service.hasFeature("tenant", "FINANCIAL")).resolves.toBe(true);
    await expect(service.hasFeature("tenant", "MOBILE_APP")).resolves.toBe(
      false,
    );
  });
});
