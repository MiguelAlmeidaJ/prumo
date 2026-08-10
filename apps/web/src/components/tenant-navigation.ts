import type { Permission } from "@prumo/contracts";
import {
  Bell,
  Building2,
  CalendarDays,
  CarFront,
  ChartNoAxesCombined,
  ClipboardCheck,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export type TenantNavigationGroupId =
  | "primary"
  | "management"
  | "structure"
  | "processes"
  | "communication"
  | "system";

export interface TenantNavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permissions: readonly Permission[];
}

export interface TenantNavigationGroup {
  id: TenantNavigationGroupId;
  label: string;
  collapsible?: boolean;
  items: readonly TenantNavigationItem[];
}

export const tenantNavigationGroups: readonly TenantNavigationGroup[] = [
  {
    id: "primary",
    label: "Principal",
    items: [
      {
        href: "/",
        label: "Visão geral",
        icon: LayoutDashboard,
        permissions: ["profile:read"],
      },
      {
        href: "/schedule",
        label: "Agenda",
        icon: CalendarDays,
        permissions: ["schedule.read"],
      },
    ],
  },
  {
    id: "management",
    label: "Gestão",
    items: [
      {
        href: "/students",
        label: "Alunos",
        icon: UsersRound,
        permissions: ["students.read"],
      },
      {
        href: "/instructors",
        label: "Instrutores",
        icon: UserRoundCheck,
        permissions: ["instructors.read"],
      },
      {
        href: "/vehicles",
        label: "Veículos",
        icon: CarFront,
        permissions: ["vehicles.read"],
      },
    ],
  },
  {
    id: "structure",
    label: "Estrutura",
    collapsible: true,
    items: [
      {
        href: "/units",
        label: "Unidades",
        icon: Building2,
        permissions: ["units.read"],
      },
      {
        href: "/classrooms",
        label: "Salas",
        icon: LayoutDashboard,
        permissions: ["classrooms.read"],
      },
    ],
  },
  {
    id: "processes",
    label: "Processos",
    items: [
      {
        href: "/exams",
        label: "Exames",
        icon: ClipboardCheck,
        permissions: ["exams.read"],
      },
      {
        href: "/financial",
        label: "Financeiro",
        icon: WalletCards,
        permissions: ["financial.dashboard.read"],
      },
    ],
  },
  {
    id: "communication",
    label: "Comunicação",
    collapsible: true,
    items: [
      {
        href: "/communication",
        label: "Mensagens",
        icon: MessageSquareText,
        permissions: [
          "communication.templates.read",
          "communication.history.read",
          "communication.campaigns.read",
          "communication.settings.manage",
        ],
      },
      {
        href: "/notifications",
        label: "Notificações",
        icon: Bell,
        permissions: ["notifications.read"],
      },
    ],
  },
  {
    id: "system",
    label: "Sistema",
    collapsible: true,
    items: [
      {
        href: "/team",
        label: "Equipe e acessos",
        icon: ShieldCheck,
        permissions: ["memberships:manage"],
      },
      {
        href: "/settings/tenant",
        label: "Autoescola",
        icon: Settings,
        permissions: ["tenant:manage"],
      },
      {
        href: "/financial/reports",
        label: "Relatórios",
        icon: ChartNoAxesCombined,
        permissions: ["financial_reports.read"],
      },
      {
        href: "/settings/notifications",
        label: "Configurações",
        icon: Settings,
        permissions: ["notifications.manage"],
      },
    ],
  },
] as const;

export const tenantNavigation = tenantNavigationGroups.flatMap(
  (group) => group.items,
);

const routePolicies = [
  { pattern: /^\/profile$/, permissions: ["profile:read"] },
  { pattern: /^\/team$/, permissions: ["memberships:manage"] },
  { pattern: /^\/settings\/tenant$/, permissions: ["tenant:manage"] },
  {
    pattern: /^\/settings\/notifications$/,
    permissions: ["notifications.read"],
  },
  { pattern: /^\/students\/new$/, permissions: ["students.create"] },
  {
    pattern: /^\/students\/[^/]+\/edit$/,
    permissions: ["students.update"],
  },
  {
    pattern: /^\/students\/[^/]+\/processes\/new$/,
    permissions: ["processes.create"],
  },
  {
    pattern: /^\/students\/[^/]+\/processes(?:\/.*)?$/,
    permissions: ["processes.read"],
  },
  {
    pattern: /^\/students\/[^/]+\/contracts(?:\/.*)?$/,
    permissions: ["contracts.read"],
  },
  { pattern: /^\/students(?:\/.*)?$/, permissions: ["students.read"] },
  {
    pattern: /^\/instructors\/new$/,
    permissions: ["instructors.create"],
  },
  {
    pattern: /^\/instructors\/[^/]+\/edit$/,
    permissions: ["instructors.update"],
  },
  {
    pattern: /^\/instructors(?:\/.*)?$/,
    permissions: ["instructors.read"],
  },
  { pattern: /^\/vehicles\/new$/, permissions: ["vehicles.create"] },
  {
    pattern: /^\/vehicles\/[^/]+\/edit$/,
    permissions: ["vehicles.update"],
  },
  { pattern: /^\/vehicles(?:\/.*)?$/, permissions: ["vehicles.read"] },
  { pattern: /^\/units\/new$/, permissions: ["units.create"] },
  { pattern: /^\/units\/[^/]+\/edit$/, permissions: ["units.update"] },
  { pattern: /^\/units(?:\/.*)?$/, permissions: ["units.read"] },
  {
    pattern: /^\/classrooms\/new$/,
    permissions: ["classrooms.create"],
  },
  {
    pattern: /^\/classrooms\/[^/]+\/edit$/,
    permissions: ["classrooms.update"],
  },
  {
    pattern: /^\/classrooms(?:\/.*)?$/,
    permissions: ["classrooms.read"],
  },
  {
    pattern: /^\/practical-lessons\/new$/,
    permissions: ["practical-lessons.create"],
  },
  {
    pattern: /^\/practical-lessons(?:\/.*)?$/,
    permissions: ["practical-lessons.read"],
  },
  {
    pattern: /^\/theoretical-classes\/new$/,
    permissions: ["theoretical-classes.create"],
  },
  {
    pattern: /^\/theoretical-classes(?:\/.*)?$/,
    permissions: ["theoretical-classes.read"],
  },
  { pattern: /^\/processes(?:\/.*)?$/, permissions: ["processes.read"] },
  { pattern: /^\/exams\/new$/, permissions: ["exams.create"] },
  { pattern: /^\/exams(?:\/.*)?$/, permissions: ["exams.read"] },
  { pattern: /^\/contracts(?:\/.*)?$/, permissions: ["contracts.read"] },
  {
    pattern: /^\/financial\/services\/new$/,
    permissions: ["services.create"],
  },
  {
    pattern: /^\/financial\/services\/[^/]+\/edit$/,
    permissions: ["services.update"],
  },
  {
    pattern: /^\/financial\/services(?:\/.*)?$/,
    permissions: ["services.read"],
  },
  {
    pattern: /^\/financial\/plans\/new$/,
    permissions: ["plans.create"],
  },
  {
    pattern: /^\/financial\/plans(?:\/.*)?$/,
    permissions: ["plans.read"],
  },
  {
    pattern: /^\/financial\/receivables(?:\/.*)?$/,
    permissions: ["receivables.read"],
  },
  {
    pattern: /^\/financial\/payments\/new$/,
    permissions: ["payments.create"],
  },
  {
    pattern: /^\/financial\/payments(?:\/.*)?$/,
    permissions: ["payments.read"],
  },
  {
    pattern: /^\/financial\/cash-registers(?:\/.*)?$/,
    permissions: ["cash_registers.read"],
  },
  {
    pattern: /^\/financial\/expenses\/new$/,
    permissions: ["expenses.create"],
  },
  {
    pattern: /^\/financial\/expenses(?:\/.*)?$/,
    permissions: ["expenses.read"],
  },
  {
    pattern: /^\/financial\/reports(?:\/.*)?$/,
    permissions: ["financial_reports.read"],
  },
  {
    pattern: /^\/financial$/,
    permissions: ["financial.dashboard.read"],
  },
  {
    pattern: /^\/communication\/templates\/new$/,
    permissions: ["communication.templates.manage"],
  },
  {
    pattern: /^\/communication\/templates\/[^/]+$/,
    permissions: ["communication.templates.manage"],
  },
  {
    pattern: /^\/communication\/templates$/,
    permissions: ["communication.templates.read"],
  },
  {
    pattern: /^\/communication\/campaigns\/new$/,
    permissions: ["communication.campaigns.create"],
  },
  {
    pattern: /^\/communication\/campaigns(?:\/.*)?$/,
    permissions: ["communication.campaigns.read"],
  },
  {
    pattern: /^\/communication\/history(?:\/.*)?$/,
    permissions: ["communication.history.read"],
  },
  {
    pattern: /^\/communication\/events(?:\/.*)?$/,
    permissions: ["communication.events.read"],
  },
  {
    pattern: /^\/communication$/,
    permissions: [
      "communication.templates.read",
      "communication.history.read",
      "communication.campaigns.read",
      "communication.settings.manage",
    ],
  },
  {
    pattern: /^\/notifications(?:\/.*)?$/,
    permissions: ["notifications.read"],
  },
  { pattern: /^\/schedule$/, permissions: ["schedule.read"] },
] as const satisfies ReadonlyArray<{
  pattern: RegExp;
  permissions: readonly Permission[];
}>;

export function hasTenantPermission(
  granted: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return (
    granted.includes("*") ||
    required.some((permission) => granted.includes(permission))
  );
}

export function visibleTenantNavigation(
  granted: readonly Permission[],
): TenantNavigationItem[] {
  return tenantNavigation.filter((item) =>
    hasTenantPermission(granted, item.permissions),
  );
}

export function visibleTenantNavigationGroups(
  granted: readonly Permission[],
): TenantNavigationGroup[] {
  return tenantNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        hasTenantPermission(granted, item.permissions),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function isTenantNavigationItemActive(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") return pathname === href;
  if (pathname === href) return true;

  const matchingItems = tenantNavigation
    .filter(
      (item) =>
        item.href !== "/" &&
        (pathname === item.href || pathname.startsWith(`${item.href}/`)),
    )
    .sort((left, right) => right.href.length - left.href.length);

  return matchingItems[0]?.href === href;
}

export function canAccessTenantPath(
  pathname: string,
  granted: readonly Permission[],
): boolean {
  if (pathname === "/") return hasTenantPermission(granted, ["profile:read"]);
  const policy = routePolicies.find(({ pattern }) => pattern.test(pathname));
  return policy ? hasTenantPermission(granted, policy.permissions) : false;
}
