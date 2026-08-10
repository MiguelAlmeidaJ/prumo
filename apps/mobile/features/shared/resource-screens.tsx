import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Text, View } from "react-native";
import {
  AppCard,
  AppEmptyState,
  AppErrorState,
  AppHeader,
  AppListItem,
  AppMoney,
  AppScreen,
  AppSkeleton,
  AppStatusBadge,
} from "@/design/components";
import { formatDateTime, label } from "@/lib/format";
import { useTheme } from "@/design/theme";

function displayValue(key: string, value: unknown) {
  if (typeof value === "number" && key.toLowerCase().endsWith("cents")) {
    return <AppMoney cents={value} />;
  }
  if (
    typeof value === "string" &&
    (key.endsWith("At") || key.toLowerCase().includes("date"))
  ) {
    return <Text>{formatDateTime(value)}</Text>;
  }
  if (typeof value === "boolean") return <Text>{value ? "Sim" : "Não"}</Text>;
  if (value === null || value === undefined) return <Text>—</Text>;
  return <Text>{String(value)}</Text>;
}

export function DataCard({ data }: { data: Record<string, unknown> }) {
  const { theme } = useTheme();
  return (
    <AppCard>
      {Object.entries(data).map(([key, value]) => {
        if (key === "id" || key === "tenantId" || value === undefined) return null;
        if (Array.isArray(value)) {
          return (
            <View key={key} style={{ gap: 8 }}>
              <Text style={{ color: theme.text, fontWeight: "800" }}>{label(key)}</Text>
              {value.length ? (
                value.map((item, index) =>
                  typeof item === "object" && item ? (
                    <DataCard key={`${key}-${index}`} data={item as Record<string, unknown>} />
                  ) : (
                    <Text key={`${key}-${index}`}>{String(item)}</Text>
                  ),
                )
              ) : (
                <Text style={{ color: theme.muted }}>Nenhum registro</Text>
              )}
            </View>
          );
        }
        if (typeof value === "object" && value) {
          return (
            <View key={key} style={{ gap: 8 }}>
              <Text style={{ color: theme.text, fontWeight: "800" }}>{label(key)}</Text>
              <DataCard data={value as Record<string, unknown>} />
            </View>
          );
        }
        return (
          <View key={key} style={{ gap: 3 }}>
            <Text style={{ color: theme.muted, fontSize: 12, textTransform: "capitalize" }}>{label(key)}</Text>
            {key === "status" && typeof value === "string" ? (
              <AppStatusBadge status={value} />
            ) : (
              displayValue(key, value)
            )}
          </View>
        );
      })}
    </AppCard>
  );
}

export function ResourceListScreen({
  title,
  queryKey,
  queryFn,
  detailBase,
  titleFor,
  subtitleFor,
}: {
  title: string;
  queryKey: readonly unknown[];
  queryFn: () => Promise<Record<string, unknown>[]>;
  detailBase: string;
  titleFor?: (item: Record<string, unknown>) => string;
  subtitleFor?: (item: Record<string, unknown>) => string;
}) {
  const query = useQuery({ queryKey, queryFn });
  return (
    <AppScreen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <AppHeader title={title} />
      {query.isPending ? <><AppSkeleton /><AppSkeleton /></> : null}
      {query.isError ? <AppErrorState message={query.error.message} onRetry={() => void query.refetch()} /> : null}
      {query.data?.length === 0 ? <AppEmptyState title="Nada por aqui" message="Não há registros para exibir." /> : null}
      {query.data?.map((item) => (
        <AppCard key={String(item.id)}>
          <AppListItem
            title={titleFor?.(item) ?? String(item.title ?? item.name ?? item.type ?? "Detalhes")}
            subtitle={subtitleFor?.(item) ?? formatDateTime(item.startsAt ?? item.scheduledAt ?? item.createdAt)}
            onPress={() => router.push(`${detailBase}/${String(item.id)}` as Href)}
            trailing={typeof item.status === "string" ? <AppStatusBadge status={item.status} /> : undefined}
          />
        </AppCard>
      ))}
    </AppScreen>
  );
}

export function ResourceDetailScreen({
  title,
  queryScope,
  queryFn,
}: {
  title: string;
  queryScope: string;
  queryFn: (id: string) => Promise<Record<string, unknown>>;
}) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: [queryScope, id],
    queryFn: () => queryFn(id),
    enabled: Boolean(id),
  });
  return (
    <AppScreen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <AppHeader title={title} />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? <AppErrorState message={query.error.message} onRetry={() => void query.refetch()} /> : null}
      {query.data ? <DataCard data={query.data} /> : null}
    </AppScreen>
  );
}
