import NetInfo from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Text } from "react-native";
import { instructorApi } from "@/api/mobile-api";
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppErrorState,
  AppHeader,
  AppInput,
  AppListItem,
  AppScreen,
  AppSection,
  AppSelect,
  AppSkeleton,
  AppStatusBadge,
} from "@/design/components";
import {
  DataCard,
  ResourceDetailScreen,
  ResourceListScreen,
} from "@/features/shared/resource-screens";
import { useAuth } from "@/auth/auth-context";
import { formatDateTime } from "@/lib/format";
import { enqueueOperation } from "@/offline/offline-queue";

export function InstructorHomeScreen() {
  const query = useQuery({
    queryKey: ["mobile-home", "instructor"],
    queryFn: instructorApi.home,
  });
  const data = query.data;
  const profile = data?.profile as Record<string, unknown> | undefined;
  const summary = data?.summary as Record<string, unknown> | undefined;
  const agenda = (data?.agenda ?? []) as Record<string, unknown>[];
  return (
    <AppScreen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <AppHeader
        title={`Olá, ${String(profile?.name ?? "instrutor")}`}
        subtitle="Sua operação de hoje."
      />
      {query.isPending ? (
        <>
          <AppSkeleton />
          <AppSkeleton />
        </>
      ) : null}
      {query.isError ? (
        <AppErrorState
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {data ? (
        <>
          <AppCard>
            <AppListItem
              title="Agenda do dia"
              subtitle={`${Number(summary?.total ?? 0)} agendada(s) · ${Number(summary?.completed ?? 0)} concluída(s) · ${Number(summary?.pending ?? 0)} pendente(s)`}
              onPress={() => router.push("/(instructor)/schedule" as Href)}
            />
          </AppCard>
          <AppSection title="Próximos compromissos">
            {agenda.length ? (
              agenda.slice(0, 5).map((item) => (
                <AppCard key={String(item.id)}>
                  <AppListItem
                    title={String(item.title)}
                    subtitle={formatDateTime(item.startsAt)}
                    onPress={() =>
                      router.push(
                        `/(instructor)/schedule/${String(item.id)}` as never,
                      )
                    }
                    trailing={
                      typeof item.status === "string" ? (
                        <AppStatusBadge status={item.status} />
                      ) : undefined
                    }
                  />
                </AppCard>
              ))
            ) : (
              <AppEmptyState title="Agenda livre hoje" />
            )}
          </AppSection>
        </>
      ) : null}
    </AppScreen>
  );
}

export function InstructorScheduleScreen() {
  const [kind, setKind] = useState("ALL");
  const [view, setView] = useState("DAY");
  const query = useQuery({
    queryKey: ["schedule", "instructor"],
    queryFn: instructorApi.schedule,
  });
  const horizon = view === "DAY" ? 86_400_000 : 7 * 86_400_000;
  const items =
    query.data?.filter(
      (item) =>
        (kind === "ALL" || item.kind === kind) &&
        new Date(item.startsAt).getTime() <= Date.now() + horizon,
    ) ?? [];
  return (
    <AppScreen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <AppHeader
        title="Agenda"
        subtitle={view === "DAY" ? "Visão diária" : "Visão semanal"}
      />
      <AppSelect
        label="Período"
        value={view}
        onChange={setView}
        options={[
          { label: "Hoje", value: "DAY" },
          { label: "Próximos 7 dias", value: "WEEK" },
        ]}
      />
      <AppSelect
        label="Tipo"
        value={kind}
        onChange={setKind}
        options={[
          { label: "Todos", value: "ALL" },
          { label: "Práticas", value: "PRACTICAL_LESSON" },
          { label: "Teóricas", value: "THEORETICAL_CLASS" },
        ]}
      />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {!query.isPending && items.length === 0 ? (
        <AppEmptyState title="Sem compromissos" />
      ) : null}
      {items.map((item) => (
        <AppCard key={item.id}>
          <AppListItem
            title={item.title}
            subtitle={formatDateTime(item.startsAt)}
            onPress={() =>
              router.push(`/(instructor)/schedule/${item.id}` as Href)
            }
            trailing={<AppStatusBadge status={item.status} />}
          />
        </AppCard>
      ))}
    </AppScreen>
  );
}
export function InstructorScheduleDetailScreen() {
  return (
    <ResourceDetailScreen
      title="Compromisso"
      queryScope="instructor-schedule"
      queryFn={instructorApi.scheduleItem}
    />
  );
}
export function InstructorLessonsScreen() {
  return (
    <ResourceListScreen
      title="Aulas práticas"
      queryKey={["lessons", "instructor"]}
      queryFn={instructorApi.lessons}
      detailBase="/(instructor)/lessons"
      titleFor={(item) =>
        String(
          (item.student as Record<string, unknown>)?.socialName ??
            (item.student as Record<string, unknown>)?.name ??
            "Aluno",
        )
      }
      subtitleFor={(item) => formatDateTime(item.startsAt)}
    />
  );
}

type OfflineKind =
  "START_LESSON" | "COMPLETE_LESSON" | "NO_SHOW" | "LESSON_EVALUATION";
export function InstructorLessonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["lesson", "instructor", id],
    queryFn: () => instructorApi.lesson(id),
  });
  const [odometer, setOdometer] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState("SATISFACTORY");

  async function operational(
    kind: OfflineKind,
    payload: Record<string, unknown>,
  ) {
    if (!session) throw new Error("Sessão ausente.");
    const network = await NetInfo.fetch();
    if (!network.isConnected || network.isInternetReachable === false) {
      await enqueueOperation({
        tenantId: session.activeMembership.tenant.id,
        userId: session.user.id,
        kind,
        resourceId: id,
        payload,
      });
      Alert.alert(
        "Ação salva",
        "Ela será sincronizada quando a conexão voltar.",
      );
      return;
    }
    const key = Crypto.randomUUID();
    if (kind === "START_LESSON")
      await instructorApi.startLesson(id, payload, key);
    if (kind === "COMPLETE_LESSON")
      await instructorApi.completeLesson(id, payload, key);
    if (kind === "NO_SHOW") await instructorApi.noShow(id, key);
    if (kind === "LESSON_EVALUATION")
      await instructorApi.evaluate(id, payload, key);
  }

  const action = useMutation({
    mutationFn: ({
      kind,
      payload,
    }: {
      kind: OfflineKind;
      payload: Record<string, unknown>;
    }) => operational(kind, payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["lesson", "instructor", id] });
      void client.invalidateQueries({
        queryKey: ["mobile-home", "instructor"],
      });
    },
    onError: (error) => Alert.alert("Ação não concluída", error.message),
  });
  const status = String(query.data?.status ?? "");
  const evaluationPayload = useMemo(
    () => ({
      control: rating,
      attention: rating,
      signaling: rating,
      parking: rating,
      gearShift: rating,
      trafficRules: rating,
      confidence: rating,
      overallRating: rating,
      notes,
      visibleToStudent: true,
    }),
    [notes, rating],
  );
  return (
    <AppScreen>
      <AppHeader title="Aula prática" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <DataCard data={query.data} /> : null}
      {query.data?.vehicle &&
      typeof (query.data.vehicle as Record<string, unknown>).id === "string" ? (
        <AppButton
          title="Registrar ocorrência no veículo"
          variant="secondary"
          onPress={() =>
            router.push(
              `/(instructor)/vehicles/${String((query.data?.vehicle as Record<string, unknown>).id)}` as Href,
            )
          }
        />
      ) : null}
      {status === "CONFIRMED" ? (
        <AppCard>
          <AppInput
            label="Quilometragem inicial"
            value={odometer}
            onChangeText={setOdometer}
            keyboardType="number-pad"
          />
          <AppButton
            title="Iniciar aula"
            loading={action.isPending}
            disabled={!odometer}
            onPress={() =>
              action.mutate({
                kind: "START_LESSON",
                payload: { odometerKm: Number(odometer) },
              })
            }
          />
        </AppCard>
      ) : null}
      {status === "IN_PROGRESS" ? (
        <AppCard>
          <AppInput
            label="Quilometragem final"
            value={odometer}
            onChangeText={setOdometer}
            keyboardType="number-pad"
          />
          <AppInput
            label="Observações visíveis ao aluno"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <AppButton
            title="Concluir aula"
            loading={action.isPending}
            disabled={!odometer}
            onPress={() =>
              action.mutate({
                kind: "COMPLETE_LESSON",
                payload: { odometerKm: Number(odometer), studentNotes: notes },
              })
            }
          />
        </AppCard>
      ) : null}
      {["CONFIRMED", "IN_PROGRESS"].includes(status) ? (
        <AppButton
          title="Marcar falta"
          variant="danger"
          loading={action.isPending}
          onPress={() => action.mutate({ kind: "NO_SHOW", payload: {} })}
        />
      ) : null}
      {["IN_PROGRESS", "COMPLETED"].includes(status) ? (
        <AppCard>
          <AppSelect
            label="Avaliação geral"
            value={rating}
            onChange={setRating}
            options={[
              "NEEDS_IMPROVEMENT",
              "DEVELOPING",
              "SATISFACTORY",
              "GOOD",
              "EXCELLENT",
            ].map((value) => ({ label: value.replaceAll("_", " "), value }))}
          />
          <AppInput
            label="Observações pedagógicas"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <AppButton
            title="Salvar avaliação"
            loading={action.isPending}
            onPress={() =>
              action.mutate({
                kind: "LESSON_EVALUATION",
                payload: evaluationPayload,
              })
            }
          />
        </AppCard>
      ) : null}
    </AppScreen>
  );
}

export function InstructorTheoreticalScreen() {
  return (
    <ResourceListScreen
      title="Turmas teóricas"
      queryKey={["theoretical", "instructor"]}
      queryFn={instructorApi.theoretical}
      detailBase="/(instructor)/theoretical-classes"
      titleFor={(item) => String(item.title)}
      subtitleFor={(item) => formatDateTime(item.startsAt)}
    />
  );
}

export function InstructorTheoreticalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["theoretical", "instructor", id],
    queryFn: () => instructorApi.theoreticalClass(id),
  });
  const participants = (query.data?.students ?? []) as Record<
    string,
    unknown
  >[];
  const mutation = useMutation({
    mutationFn: async (action: "start" | "attendance" | "complete") => {
      const key = Crypto.randomUUID();
      if (action === "start") return instructorApi.startTheoretical(id, key);
      if (action === "complete")
        return instructorApi.completeTheoretical(id, key);
      return instructorApi.attendance(
        id,
        {
          attendance: participants.map((entry) => ({
            studentId: entry.studentId,
            status: "PRESENT",
          })),
        },
        key,
      );
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["theoretical", "instructor", id] }),
    onError: (error) => Alert.alert("Ação não concluída", error.message),
  });
  return (
    <AppScreen>
      <AppHeader title="Turma teórica" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <DataCard data={query.data} /> : null}
      {query.data?.status === "CONFIRMED" ? (
        <AppButton
          title="Iniciar turma"
          loading={mutation.isPending}
          onPress={() => mutation.mutate("start")}
        />
      ) : null}
      {query.data?.status === "IN_PROGRESS" ? (
        <>
          <AppButton
            title="Marcar todos presentes"
            loading={mutation.isPending}
            onPress={() => mutation.mutate("attendance")}
          />
          <AppButton
            title="Concluir turma"
            loading={mutation.isPending}
            onPress={() => mutation.mutate("complete")}
          />
        </>
      ) : null}
    </AppScreen>
  );
}

export function InstructorStudentsScreen() {
  return (
    <ResourceListScreen
      title="Meus alunos"
      queryKey={["instructor-students"]}
      queryFn={instructorApi.students}
      detailBase="/(instructor)/students"
      titleFor={(item) => String(item.socialName ?? item.name)}
      subtitleFor={(item) =>
        `${Number((item._count as Record<string, unknown>)?.lessons ?? 0)} aula(s) concluída(s)`
      }
    />
  );
}
export function InstructorStudentDetailScreen() {
  return (
    <ResourceDetailScreen
      title="Aluno"
      queryScope="instructor-student"
      queryFn={instructorApi.student}
    />
  );
}
export function InstructorVehiclesScreen() {
  return (
    <ResourceListScreen
      title="Veículos"
      queryKey={["vehicles"]}
      queryFn={instructorApi.vehicles}
      detailBase="/(instructor)/vehicles"
      titleFor={(item) => `${String(item.model)} · ${String(item.plate)}`}
      subtitleFor={(item) => String(item.status)}
    />
  );
}

export function InstructorVehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => instructorApi.vehicle(id),
  });
  const [type, setType] = useState("VEHICLE_ISSUE");
  const [description, setDescription] = useState("");
  const occurrence = useMutation({
    mutationFn: async () => {
      if (!session) return;
      const payload = {
        type,
        description,
        occurredAt: new Date().toISOString(),
      };
      const network = await NetInfo.fetch();
      if (!network.isConnected || network.isInternetReachable === false) {
        return enqueueOperation({
          tenantId: session.activeMembership.tenant.id,
          userId: session.user.id,
          kind: "VEHICLE_OCCURRENCE",
          resourceId: id,
          payload,
        });
      }
      return instructorApi.occurrence(id, payload, Crypto.randomUUID());
    },
    onSuccess: () => {
      setDescription("");
      void client.invalidateQueries({ queryKey: ["vehicle", id] });
    },
    onError: (error) => Alert.alert("Ocorrência não registrada", error.message),
  });
  return (
    <AppScreen>
      <AppHeader title="Veículo" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <DataCard data={query.data} /> : null}
      <AppCard>
        <AppSelect
          label="Tipo de ocorrência"
          value={type}
          onChange={setType}
          options={[
            "VEHICLE_ISSUE",
            "ACCIDENT",
            "DAMAGE",
            "MECHANICAL_PROBLEM",
            "CLEANING_REQUIRED",
            "OTHER",
          ].map((value) => ({ label: value.replaceAll("_", " "), value }))}
        />
        <AppInput
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <AppButton
          title="Registrar ocorrência"
          loading={occurrence.isPending}
          disabled={description.trim().length < 3}
          onPress={() => occurrence.mutate()}
        />
      </AppCard>
    </AppScreen>
  );
}

export function InstructorProfileScreen() {
  const query = useQuery({
    queryKey: ["profile", "instructor"],
    queryFn: instructorApi.profile,
  });
  const { session, logout, showTenantSelection } = useAuth();
  return (
    <AppScreen>
      <AppHeader title="Perfil" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <DataCard data={query.data} /> : null}
      <AppSection title="Atalhos">
        <AppButton
          title="Turmas teóricas"
          variant="secondary"
          onPress={() =>
            router.push("/(instructor)/theoretical-classes" as Href)
          }
        />
        <AppButton
          title="Veículos"
          variant="secondary"
          onPress={() => router.push("/(instructor)/vehicles" as Href)}
        />
        <AppButton
          title="Notificações"
          variant="secondary"
          onPress={() => router.push("/(instructor)/notifications" as Href)}
        />
        <AppButton
          title="Segurança da conta"
          variant="secondary"
          onPress={() => router.push("/(instructor)/security" as Href)}
        />
      </AppSection>
      {session && session.memberships.length > 1 ? (
        <AppButton
          title="Trocar autoescola"
          variant="secondary"
          onPress={showTenantSelection}
        />
      ) : null}
      <AppButton title="Sair" variant="danger" onPress={() => void logout()} />
    </AppScreen>
  );
}
