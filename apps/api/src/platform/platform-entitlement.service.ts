import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  TenantSubscriptionStatus,
  type PlatformPlan,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

export const PLATFORM_FEATURES = [
  "FINANCIAL",
  "MOBILE_APP",
  "NOTIFICATIONS",
  "MULTI_UNIT",
  "ADVANCED_REPORTS",
  "CUSTOM_BRANDING",
  "API_ACCESS",
] as const;

export type PlatformFeature = (typeof PLATFORM_FEATURES)[number];
type LimitedResource = "users" | "students" | "units";

@Injectable()
export class PlatformEntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(tenantId: string) {
    const plan = await this.getActivePlan(tenantId);
    const [users, students, units] = await Promise.all([
      this.prisma.membership.count({
        where: { tenantId, active: true },
      }),
      this.prisma.student.count({
        where: { tenantId, status: "ACTIVE" },
      }),
      this.prisma.schoolUnit.count({
        where: { tenantId, active: true },
      }),
    ]);
    return {
      plan: { id: plan.id, code: plan.code, name: plan.name },
      resources: {
        users: { used: users, limit: plan.maxUsers },
        students: { used: students, limit: plan.maxStudents },
        units: { used: units, limit: plan.maxUnits },
        storageBytes: { used: null, limit: plan.maxStorageBytes?.toString() ?? null },
      },
      features: this.readFeatures(plan),
    };
  }

  async assertCanCreate(
    tenantId: string,
    resource: LimitedResource,
  ): Promise<void> {
    const usage = await this.getUsage(tenantId);
    const current = usage.resources[resource];
    if (current.limit !== null && current.used >= current.limit) {
      throw new ConflictException(
        `Limite do plano atingido para ${resource}.`,
      );
    }
  }

  async hasFeature(
    tenantId: string,
    feature: PlatformFeature,
  ): Promise<boolean> {
    const plan = await this.getActivePlan(tenantId);
    return this.readFeatures(plan)[feature] === true;
  }

  async assertFeature(
    tenantId: string,
    feature: PlatformFeature,
  ): Promise<void> {
    if (!(await this.hasFeature(tenantId, feature))) {
      throw new ConflictException(
        `A feature ${feature} não está habilitada no plano.`,
      );
    }
  }

  private async getActivePlan(tenantId: string): Promise<PlatformPlan> {
    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: {
        tenantId,
        status: {
          in: [
            TenantSubscriptionStatus.TRIALING,
            TenantSubscriptionStatus.ACTIVE,
          ],
        },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription) {
      throw new NotFoundException("Tenant sem assinatura ativa.");
    }
    return subscription.plan;
  }

  private readFeatures(plan: PlatformPlan): Record<PlatformFeature, boolean> {
    const configured =
      plan.features && typeof plan.features === "object"
        ? (plan.features as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      PLATFORM_FEATURES.map((feature) => [
        feature,
        configured[feature] === true,
      ]),
    ) as Record<PlatformFeature, boolean>;
  }
}
