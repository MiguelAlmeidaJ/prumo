import type {
  TenantSettingsSummary,
  UpdateTenantSettingsInput,
} from "@prumo/contracts";
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class TenantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string): Promise<TenantSettingsSummary> {
    const settings = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    return this.summary(settings);
  }

  async update(
    tenantId: string,
    actorUserId: string,
    input: UpdateTenantSettingsInput,
  ): Promise<TenantSettingsSummary> {
    if (input.timezone) this.assertTimezone(input.timezone);
    const settings = await this.prisma.$transaction(async (transaction) => {
      if (input.name !== undefined) {
        await transaction.tenant.update({
          where: { id: tenantId },
          data: { name: input.name.trim() },
        });
      }
      const updated = await transaction.tenantSettings.upsert({
        where: { tenantId },
        create: {
          tenantId,
          timezone: input.timezone,
          locale: input.locale,
          supportAccessEnabled: input.supportAccessEnabled,
        },
        update: {
          timezone: input.timezone,
          locale: input.locale,
          supportAccessEnabled: input.supportAccessEnabled,
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: "TenantSettings",
          entityId: updated.id,
          action: "TENANT_SETTINGS_UPDATED",
          after: {
            name: updated.tenant.name,
            timezone: updated.timezone,
            locale: updated.locale,
            supportAccessEnabled: updated.supportAccessEnabled,
          },
        },
      });
      return updated;
    });
    return this.summary(settings);
  }

  private assertTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException("Fuso horário inválido.");
    }
  }

  private summary(settings: {
    tenant: { id: string; name: string; slug: string };
    timezone: string;
    locale: string;
    supportAccessEnabled: boolean;
    requireMfaForManagers: boolean;
    updatedAt: Date;
  }): TenantSettingsSummary {
    return {
      tenant: settings.tenant,
      timezone: settings.timezone,
      locale: settings.locale,
      supportAccessEnabled: settings.supportAccessEnabled,
      requireMfaForManagers: settings.requireMfaForManagers,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
