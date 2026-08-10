import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert } from "react-native";
import { notificationsApi } from "@/api/mobile-api";
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppErrorState,
  AppHeader,
  AppListItem,
  AppScreen,
  AppSkeleton,
} from "@/design/components";
import { safeActionRoute } from "@/lib/deep-links";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/auth/auth-context";

export function NotificationsScreen() {
  const { session } = useAuth();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notifications"], queryFn: notificationsApi.list });
  const read = useMutation({
    mutationFn: notificationsApi.read,
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const all = useMutation({
    mutationFn: notificationsApi.readAll,
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const data = Array.isArray(query.data) ? query.data : query.data?.data ?? [];
  return (
    <AppScreen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <AppHeader title="Notificações" action={<AppButton title="Ler todas" variant="secondary" loading={all.isPending} onPress={() => all.mutate()} />} />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? <AppErrorState message={query.error.message} onRetry={() => void query.refetch()} /> : null}
      {!query.isPending && data.length === 0 ? <AppEmptyState title="Sem notificações" /> : null}
      {data.map((item) => (
        <AppCard key={String(item.id)}>
          <AppListItem
            title={String(item.title ?? "Notificação")}
            subtitle={`${String(item.body ?? "")}\n${formatDateTime(item.createdAt)}`}
            onPress={() => {
              void read.mutateAsync(String(item.id)).then(() => {
                const route = safeActionRoute(
                  item.actionUrl as string | null,
                  session?.activeMembership.role,
                );
                if (route) router.push(route);
              });
            }}
          />
        </AppCard>
      ))}
    </AppScreen>
  );
}

export function NotificationSettingsScreen() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["notification-settings"],
    queryFn: notificationsApi.settings,
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: notificationsApi.preferences,
  });
  const settingsMutation = useMutation({
    mutationFn: (field: "emailEnabled" | "pushEnabled") => {
      const current = query.data;
      if (!current) throw new Error("Configurações ainda não carregadas.");
      return notificationsApi.updateSettings({
        emailEnabled: Boolean(current.emailEnabled),
        pushEnabled: Boolean(current.pushEnabled),
        smsEnabled: Boolean(current.smsEnabled),
        quietHoursStart: current.quietHoursStart ?? null,
        quietHoursEnd: current.quietHoursEnd ?? null,
        timezone: String(current.timezone ?? "America/Sao_Paulo"),
        language: String(current.language ?? "pt-BR"),
        [field]: !Boolean(current[field]),
      });
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notification-settings"] }),
    onError: (error) =>
      Alert.alert("Preferências", error.message),
  });
  const preferenceMutation = useMutation({
    mutationFn: (eventType: string) => {
      const next = (preferences.data ?? []).map((item) => ({
        eventType: String(item.eventType),
        inAppEnabled: Boolean(item.inAppEnabled),
        emailEnabled: Boolean(item.emailEnabled),
        pushEnabled:
          String(item.eventType) === eventType
            ? !Boolean(item.pushEnabled)
            : Boolean(item.pushEnabled),
        smsEnabled: Boolean(item.smsEnabled),
        reminderMinutesBefore:
          typeof item.reminderMinutesBefore === "number"
            ? item.reminderMinutesBefore
            : null,
      }));
      return notificationsApi.updatePreferences(next);
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notification-preferences"] }),
    onError: (error) =>
      Alert.alert("Preferências", error.message),
  });
  const loading = query.isPending || preferences.isPending;
  const error = query.error ?? preferences.error;
  return (
    <AppScreen
      refreshing={query.isRefetching || preferences.isRefetching}
      onRefresh={() => {
        void query.refetch();
        void preferences.refetch();
      }}
    >
      <AppHeader title="Preferências de notificação" />
      {loading ? <AppSkeleton /> : null}
      {error ? (
        <AppErrorState
          message={error.message}
          onRetry={() => {
            void query.refetch();
            void preferences.refetch();
          }}
        />
      ) : null}
      {query.data ? (
        <AppCard>
          <AppListItem
            title="Push"
            subtitle={query.data.pushEnabled ? "Ativado" : "Desativado"}
            trailing={
              <AppButton
                title={query.data.pushEnabled ? "Desativar" : "Ativar"}
                variant="secondary"
                loading={settingsMutation.isPending}
                onPress={() => settingsMutation.mutate("pushEnabled")}
              />
            }
          />
          <AppListItem
            title="E-mail"
            subtitle={query.data.emailEnabled ? "Ativado" : "Desativado"}
            trailing={
              <AppButton
                title={query.data.emailEnabled ? "Desativar" : "Ativar"}
                variant="secondary"
                loading={settingsMutation.isPending}
                onPress={() => settingsMutation.mutate("emailEnabled")}
              />
            }
          />
        </AppCard>
      ) : null}
      {(preferences.data ?? []).map((item) => (
        <AppCard key={String(item.eventType)}>
          <AppListItem
            title={String(item.eventType).replaceAll("_", " ")}
            subtitle={`Push ${item.pushEnabled ? "ativado" : "desativado"}`}
            trailing={
              <AppButton
                title={item.pushEnabled ? "Desativar" : "Ativar"}
                variant="secondary"
                loading={preferenceMutation.isPending}
                onPress={() =>
                  preferenceMutation.mutate(String(item.eventType))
                }
              />
            }
          />
        </AppCard>
      ))}
    </AppScreen>
  );
}
