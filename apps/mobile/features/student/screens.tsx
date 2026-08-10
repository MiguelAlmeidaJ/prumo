import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Text } from "react-native";
import { studentApi } from "@/api/mobile-api";
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
import { useTheme } from "@/design/theme";
import { addToCalendar } from "@/lib/device-calendar";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  DataCard,
  ResourceDetailScreen,
  ResourceListScreen,
} from "@/features/shared/resource-screens";
import { useAuth } from "@/auth/auth-context";

export function StudentHomeScreen() {
  const query = useQuery({
    queryKey: ["mobile-home", "student"],
    queryFn: studentApi.home,
  });
  const { theme } = useTheme();
  const data = query.data;
  const profile = data?.profile as Record<string, unknown> | undefined;
  const process = data?.activeProcess as
    Record<string, unknown> | null | undefined;
  return (
    <AppScreen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <AppHeader
        title={`Olá, ${String(profile?.socialName ?? profile?.name ?? "aluno")}`}
        subtitle="Veja o que vem a seguir."
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
          <AppSection title="Próximos passos">
            <HomeLink
              title="Próxima aula"
              data={data.nextLesson}
              path="/(student)/lessons"
            />
            <HomeLink
              title="Próximo exame"
              data={data.nextExam}
              path="/(student)/exams"
            />
          </AppSection>
          <AppCard>
            <Text style={{ color: theme.text, fontWeight: "800" }}>
              Progresso do processo
            </Text>
            <Text
              style={{ color: theme.primary, fontSize: 28, fontWeight: "900" }}
            >
              {Number(process?.progressPercent ?? 0)}%
            </Text>
            <Text style={{ color: theme.muted }}>
              {Number(
                (data.practicalLessons as Record<string, unknown>)?.completed ??
                  0,
              )}{" "}
              aulas concluídas ·{" "}
              {Number(
                (data.practicalLessons as Record<string, unknown>)?.remaining ??
                  0,
              )}{" "}
              restantes
            </Text>
          </AppCard>
          <AppSection title="Pendências">
            <AppListItem
              title="Documentos"
              subtitle={`${Number(data.pendingDocuments ?? 0)} pendente(s)`}
              onPress={() => router.push("/(student)/documents" as Href)}
            />
            <AppListItem
              title="Financeiro"
              subtitle="Consultar parcelas próximas e vencidas"
              onPress={() => router.push("/(student)/financial" as Href)}
            />
          </AppSection>
        </>
      ) : null}
    </AppScreen>
  );
}

function HomeLink({
  title,
  data,
  path,
}: {
  title: string;
  data: unknown;
  path: "/(student)/lessons" | "/(student)/exams";
}) {
  const item = data as Record<string, unknown> | null;
  return (
    <AppCard>
      {item ? (
        <AppListItem
          title={title}
          subtitle={formatDateTime(item.startsAt ?? item.scheduledAt)}
          onPress={() => router.push(path as Href)}
          trailing={
            typeof item.status === "string" ? (
              <AppStatusBadge status={item.status} />
            ) : undefined
          }
        />
      ) : (
        <AppEmptyState title={`Sem ${title.toLocaleLowerCase("pt-BR")}`} />
      )}
    </AppCard>
  );
}

export function StudentScheduleScreen() {
  const [kind, setKind] = useState("ALL");
  const query = useQuery({
    queryKey: ["schedule", "student"],
    queryFn: studentApi.schedule,
  });
  const items =
    query.data?.filter((item) => kind === "ALL" || item.kind === kind) ?? [];
  return (
    <AppScreen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <AppHeader
        title="Agenda"
        subtitle={new Intl.DateTimeFormat("pt-BR", {
          month: "long",
          year: "numeric",
        }).format(new Date())}
      />
      <AppSelect
        label="Tipo"
        value={kind}
        onChange={setKind}
        options={[
          { label: "Todos", value: "ALL" },
          { label: "Aulas práticas", value: "PRACTICAL_LESSON" },
          { label: "Turmas teóricas", value: "THEORETICAL_CLASS" },
          { label: "Exames", value: "EXAM" },
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
              router.push(`/(student)/schedule/${item.id}` as Href)
            }
            trailing={<AppStatusBadge status={item.status} />}
          />
        </AppCard>
      ))}
    </AppScreen>
  );
}

export function StudentScheduleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["schedule", "student", id],
    queryFn: () => studentApi.scheduleItem(id),
  });
  const calendar = useMutation({
    mutationFn: async () => {
      if (!query.data) return;
      return addToCalendar({
        title: query.data.title,
        startsAt: query.data.startsAt,
        endsAt: query.data.endsAt,
        location: query.data.unit?.address,
      });
    },
    onSuccess: () =>
      Alert.alert("Adicionado", "Compromisso salvo no calendário."),
    onError: (error) => Alert.alert("Calendário", error.message),
  });
  return (
    <AppScreen>
      <AppHeader title="Compromisso" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? (
        <>
          <DataCard data={query.data as unknown as Record<string, unknown>} />
          <AppButton
            title="Adicionar ao calendário"
            loading={calendar.isPending}
            onPress={() => calendar.mutate()}
          />
        </>
      ) : null}
    </AppScreen>
  );
}

export function StudentLessonsScreen() {
  return (
    <ResourceListScreen
      title="Aulas práticas"
      queryKey={["lessons", "student"]}
      queryFn={studentApi.lessons}
      detailBase="/(student)/lessons"
      titleFor={(item) =>
        `Aula · ${String((item.instructor as Record<string, unknown>)?.name ?? "")}`
      }
      subtitleFor={(item) => formatDateTime(item.startsAt)}
    />
  );
}

export function StudentLessonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["lesson", "student", id],
    queryFn: () => studentApi.lesson(id),
  });
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState("CANCEL");
  const confirm = useMutation({
    mutationFn: () => studentApi.confirmLesson(id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["lesson", "student", id] }),
    onError: (error) =>
      Alert.alert("Não foi possível confirmar", error.message),
  });
  const change = useMutation({
    mutationFn: () =>
      studentApi.changeLesson(id, {
        type: kind,
        reason,
        preferredStartsAt:
          kind === "RESCHEDULE"
            ? new Date(Date.now() + 86_400_000).toISOString()
            : undefined,
      }),
    onSuccess: () => {
      setReason("");
      void client.invalidateQueries({ queryKey: ["lesson", "student", id] });
    },
    onError: (error) => Alert.alert("Solicitação não enviada", error.message),
  });
  return (
    <AppScreen>
      <AppHeader title="Detalhes da aula" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <DataCard data={query.data} /> : null}
      {query.data?.status === "PENDING" ? (
        <AppButton
          title="Confirmar presença"
          loading={confirm.isPending}
          onPress={() => confirm.mutate()}
        />
      ) : null}
      {query.data &&
      ["PENDING", "CONFIRMED"].includes(String(query.data.status)) ? (
        <AppCard>
          <AppSelect
            label="Solicitação"
            value={kind}
            onChange={setKind}
            options={[
              { label: "Cancelamento", value: "CANCEL" },
              { label: "Reagendamento", value: "RESCHEDULE" },
            ]}
          />
          <AppInput
            label="Motivo"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <AppButton
            title="Enviar solicitação"
            loading={change.isPending}
            disabled={reason.trim().length < 3}
            onPress={() => change.mutate()}
          />
        </AppCard>
      ) : null}
    </AppScreen>
  );
}

export function StudentProcessesScreen() {
  return (
    <ResourceListScreen
      title="Processos"
      queryKey={["processes", "student"]}
      queryFn={studentApi.processes}
      detailBase="/(student)/processes"
      titleFor={(item) => String(item.processType)}
      subtitleFor={(item) => String(item.status)}
    />
  );
}
export function StudentProcessDetailScreen() {
  return (
    <ResourceDetailScreen
      title="Processo"
      queryScope="student-process"
      queryFn={studentApi.process}
    />
  );
}
export function StudentExamsScreen() {
  return (
    <ResourceListScreen
      title="Exames"
      queryKey={["exams", "student"]}
      queryFn={studentApi.exams}
      detailBase="/(student)/exams"
      titleFor={(item) => `Exame ${String(item.type)}`}
      subtitleFor={(item) => formatDateTime(item.scheduledAt)}
    />
  );
}
export function StudentExamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["student-exam", id],
    queryFn: () => studentApi.exam(id),
  });
  const calendar = useMutation({
    mutationFn: () =>
      addToCalendar({
        title: `Exame ${String(query.data?.type ?? "")}`,
        startsAt: String(query.data?.scheduledAt),
        endsAt: String(query.data?.scheduledAt),
        location: String(query.data?.location ?? ""),
      }),
    onSuccess: () => Alert.alert("Adicionado", "Exame salvo no calendário."),
    onError: (error) => Alert.alert("Calendário", error.message),
  });
  return (
    <AppScreen>
      <AppHeader title="Exame" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? (
        <>
          <DataCard data={query.data} />
          <AppButton
            title="Adicionar ao calendário"
            loading={calendar.isPending}
            onPress={() => calendar.mutate()}
          />
        </>
      ) : null}
    </AppScreen>
  );
}

export function StudentFinancialScreen() {
  const query = useQuery({
    queryKey: ["financial", "student"],
    queryFn: studentApi.financial,
  });
  const summary = query.data?.summary as Record<string, number> | undefined;
  const contracts = (query.data?.contracts ?? []) as Record<string, unknown>[];
  const installments = (query.data?.installments ?? []) as Record<
    string,
    unknown
  >[];
  const payments = (query.data?.payments ?? []) as Record<string, unknown>[];
  return (
    <AppScreen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <AppHeader
        title="Financeiro"
        subtitle="Consulta apenas; pagamentos não são realizados pelo app."
      />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {summary ? (
        <AppCard>
          <AppListItem
            title="Em aberto"
            subtitle={formatMoney(summary.totalOpenCents)}
          />
          <AppListItem
            title="Vencido"
            subtitle={formatMoney(summary.overdueCents)}
          />
        </AppCard>
      ) : null}
      <FinancialLinks
        title="Contratos"
        items={contracts}
        base="/(student)/financial/contracts"
      />
      <FinancialLinks
        title="Parcelas"
        items={installments}
        base="/(student)/financial/installments"
      />
      <FinancialLinks
        title="Pagamentos"
        items={payments}
        base="/(student)/financial/payments"
      />
    </AppScreen>
  );
}

function FinancialLinks({
  title,
  items,
  base,
}: {
  title: string;
  items: Record<string, unknown>[];
  base: string;
}) {
  return (
    <AppSection title={title}>
      {items.length ? (
        items.map((item) => (
          <AppCard key={String(item.id)}>
            <AppListItem
              title={String(
                item.contractNumber ??
                  item.installmentNumber ??
                  item.paymentMethod ??
                  title,
              )}
              subtitle={
                typeof item.balanceCents === "number"
                  ? formatMoney(item.balanceCents)
                  : typeof item.amountCents === "number"
                    ? formatMoney(item.amountCents)
                    : String(item.status ?? "")
              }
              onPress={() => router.push(`${base}/${String(item.id)}` as never)}
            />
          </AppCard>
        ))
      ) : (
        <AppEmptyState title={`Sem ${title.toLowerCase()}`} />
      )}
    </AppSection>
  );
}

export function StudentContractDetailScreen() {
  return (
    <ResourceDetailScreen
      title="Contrato"
      queryScope="contract"
      queryFn={studentApi.contract}
    />
  );
}
export function StudentInstallmentDetailScreen() {
  return (
    <ResourceDetailScreen
      title="Parcela"
      queryScope="installment"
      queryFn={studentApi.installment}
    />
  );
}
export function StudentPaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["payment", id],
    queryFn: () => studentApi.payment(id),
  });
  return (
    <AppScreen>
      <AppHeader title="Pagamento" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <DataCard data={query.data} /> : null}
      {typeof query.data?.externalReference === "string" ? (
        <AppButton
          title="Copiar referência"
          variant="secondary"
          onPress={() =>
            void Clipboard.setStringAsync(
              String(query.data?.externalReference),
            ).then(() => Alert.alert("Copiado", "Referência copiada."))
          }
        />
      ) : null}
    </AppScreen>
  );
}

export function StudentDocumentsScreen() {
  return (
    <>
      <ResourceListScreen
        title="Documentos"
        queryKey={["documents", "student"]}
        queryFn={studentApi.documents}
        detailBase="/(student)/documents"
        titleFor={(item) => String(item.documentType)}
        subtitleFor={(item) =>
          item.rejectionReason
            ? `Rejeitado: ${String(item.rejectionReason)}`
            : String(item.status)
        }
      />
    </>
  );
}
export function StudentDocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["student-document", id],
    queryFn: () => studentApi.document(id),
  });
  const uploaded = query.data?.studentDocument as
    Record<string, unknown> | null | undefined;
  return (
    <AppScreen>
      <AppHeader title="Documento" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <DataCard data={query.data} /> : null}
      {query.data ? (
        <AppButton
          title={uploaded ? "Substituir arquivo" : "Enviar arquivo"}
          onPress={() =>
            router.push({
              pathname: "/(student)/documents/upload",
              params: {
                documentId: uploaded?.id ? String(uploaded.id) : undefined,
                requirementId: id,
                documentType: String(query.data?.documentType ?? "OTHER"),
              },
            } as never)
          }
        />
      ) : null}
    </AppScreen>
  );
}

type Picked = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  temporary: boolean;
};
export function StudentDocumentUploadScreen() {
  const params = useLocalSearchParams<{
    documentId?: string;
    requirementId?: string;
    documentType?: string;
  }>();
  const client = useQueryClient();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [type, setType] = useState(params.documentType ?? "OTHER");
  const [progress, setProgress] = useState(0);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (picked?.temporary) {
        const file = new File(picked.uri);
        if (file.exists) file.delete();
      }
    },
    [picked],
  );
  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 10 * 1024 * 1024)
        return Alert.alert("Arquivo muito grande", "O limite é 10 MB.");
      setPicked({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? "application/pdf",
        size: asset.size ?? new File(asset.uri).size,
        temporary: true,
      });
    }
  }
  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(
        "Permissão necessária",
        "Libere acesso às fotos para anexar a imagem.",
      );
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const compressed = await ImageManipulator.manipulateAsync(asset.uri, [], {
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const file = new File(compressed.uri);
      if (file.size > 10 * 1024 * 1024) {
        if (file.exists) file.delete();
        return Alert.alert("Arquivo muito grande", "O limite é 10 MB.");
      }
      setPicked({
        uri: compressed.uri,
        name: "documento.jpg",
        mimeType: "image/jpeg",
        size: file.size,
        temporary: true,
      });
    }
  }
  const upload = useMutation({
    mutationFn: async () => {
      if (!picked) return;
      const controller = new AbortController();
      uploadController.current = controller;
      setProgress(10);
      const ticket = await studentApi.uploadTicket({
        documentType: type,
        fileName: picked.name,
        mimeType: picked.mimeType,
        sizeBytes: picked.size,
        documentId: params.documentId,
        processRequirementId: params.requirementId,
      });
      setProgress(35);
      const file = new File(picked.uri);
      try {
        const content = await file.base64();
        setProgress(70);
        await studentApi.upload(ticket.uploadUrl, content, controller.signal);
        setProgress(100);
      } finally {
        if (file.exists) file.delete();
        uploadController.current = null;
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["documents", "student"] });
      Alert.alert("Documento enviado", "O arquivo ficará aguardando análise.");
      router.back();
    },
    onError: (error) => {
      setProgress(0);
      Alert.alert(
        error.message === "Solicitação cancelada."
          ? "Upload cancelado"
          : "Falha no upload",
        error.message,
      );
    },
  });
  return (
    <AppScreen>
      <AppHeader
        title="Enviar documento"
        subtitle="PDF, JPEG ou PNG, até 10 MB. O arquivo temporário é removido após o envio."
      />
      <AppSelect
        label="Tipo"
        value={type}
        onChange={setType}
        options={[
          "RG",
          "CNH",
          "BIRTH_CERTIFICATE",
          "PROOF_OF_ADDRESS",
          "OTHER",
        ].map((value) => ({ label: value.replaceAll("_", " "), value }))}
      />
      <AppButton
        title="Escolher arquivo"
        variant="secondary"
        onPress={() => void pickDocument()}
      />
      <AppButton
        title="Escolher imagem"
        variant="secondary"
        onPress={() => void pickImage()}
      />
      {picked ? (
        <AppCard>
          <Text>{picked.name}</Text>
          <Text>{Math.ceil(picked.size / 1024)} KB</Text>
        </AppCard>
      ) : null}
      {upload.isPending ? (
        <AppCard>
          <Text>Envio: {progress}%</Text>
        </AppCard>
      ) : null}
      <AppButton
        title="Enviar"
        loading={upload.isPending}
        disabled={!picked}
        onPress={() => upload.mutate()}
      />
      {upload.isPending ? (
        <AppButton
          title="Cancelar upload"
          variant="danger"
          onPress={() => uploadController.current?.abort()}
        />
      ) : null}
    </AppScreen>
  );
}

export function StudentProfileScreen() {
  return (
    <ProfileScreen
      queryKey={["profile", "student"]}
      queryFn={studentApi.profile}
    />
  );
}
export function ProfileScreen({
  queryKey,
  queryFn,
}: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<Record<string, unknown>>;
}) {
  const { session, logout, showTenantSelection } = useAuth();
  const { mode, setMode } = useTheme();
  const query = useQuery({ queryKey, queryFn });
  const student = session?.activeMembership.role === "STUDENT";
  return (
    <AppScreen>
      <AppHeader title="Perfil" />
      {query.isPending ? <AppSkeleton /> : null}
      {query.isError ? (
        <AppErrorState onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <DataCard data={query.data} /> : null}
      <AppSection title="Atalhos">
        {student ? (
          <>
            <AppButton
              title="Enviar documento"
              variant="secondary"
              onPress={() => router.push("/(student)/documents/upload" as Href)}
            />
            <AppButton
              title="Exames"
              variant="secondary"
              onPress={() => router.push("/(student)/exams" as Href)}
            />
            <AppButton
              title="Notificações"
              variant="secondary"
              onPress={() => router.push("/(student)/notifications" as Href)}
            />
            <AppButton
              title="Segurança da conta"
              variant="secondary"
              onPress={() => router.push("/(student)/security" as Href)}
            />
          </>
        ) : null}
      </AppSection>
      <AppSelect
        label="Tema"
        value={mode}
        onChange={(value) => setMode(value as "system" | "light" | "dark")}
        options={[
          { label: "Sistema", value: "system" },
          { label: "Claro", value: "light" },
          { label: "Escuro", value: "dark" },
        ]}
      />
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
