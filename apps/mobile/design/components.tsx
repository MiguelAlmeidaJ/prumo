import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ScrollViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import { useTheme } from "./theme";

export function AppScreen({
  children,
  refreshing,
  onRefresh,
  ...props
}: PropsWithChildren<
  ScrollViewProps & { refreshing?: boolean; onRefresh?: () => void }
>) {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={["top"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} />
          ) : undefined
        }
        {...props}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>
          {title}
        </Text>
        {subtitle ? <Text style={{ color: theme.muted, marginTop: 4 }}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function AppButton({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { theme } = useTheme();
  const background =
    variant === "primary" ? theme.primary : variant === "danger" ? theme.danger : theme.surface;
  const color = variant === "primary" ? theme.primaryText : variant === "danger" ? "#FFF" : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 18,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: background,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: theme.border,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={{ color, fontWeight: "800" }}>{title}</Text>}
    </Pressable>
  );
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.text, fontWeight: "700" }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        secureTextEntry={secureTextEntry}
        autoCapitalize={secureTextEntry ? "none" : "sentences"}
        keyboardType={keyboardType}
        multiline={multiline}
        style={{
          minHeight: multiline ? 96 : 48,
          color: theme.text,
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 12,
          padding: 12,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

export function AppPasswordInput(props: Omit<Parameters<typeof AppInput>[0], "secureTextEntry">) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <AppInput {...props} secureTextEntry={!visible} />
      <Pressable accessibilityRole="button" onPress={() => setVisible((value) => !value)}>
        <Text>{visible ? "Ocultar senha" : "Mostrar senha"}</Text>
      </Pressable>
    </View>
  );
}

export function AppCard({ children }: PropsWithChildren) {
  const { theme } = useTheme();
  return (
    <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
      {children}
    </View>
  );
}

export function AppBadge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const { theme } = useTheme();
  const color = tone === "success" ? theme.success : tone === "warning" ? theme.warning : tone === "danger" ? theme.danger : theme.muted;
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: color, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

export function AppStatusBadge({ status }: { status: string }) {
  const tone = ["COMPLETED", "APPROVED", "CONFIRMED", "PAID"].includes(status)
    ? "success"
    : ["CANCELLED", "REJECTED", "OVERDUE", "FAILED"].includes(status)
      ? "danger"
      : "warning";
  return <AppBadge label={status.replaceAll("_", " ")} tone={tone} />;
}

export function AppListItem({
  title,
  subtitle,
  onPress,
  trailing,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: "700" }}>{title}</Text>
        {subtitle ? <Text style={{ color: theme.muted, marginTop: 3 }}>{subtitle}</Text> : null}
      </View>
      {trailing ?? (onPress ? <Text style={{ color: theme.primary, fontSize: 20 }}>›</Text> : null)}
    </Pressable>
  );
}

export function AppMoney({ cents }: { cents: number }) {
  return <Text>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)}</Text>;
}

export function AppDate({ value }: { value: string | Date }) {
  return <Text>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value))}</Text>;
}

export function AppDateTime({ value }: { value: string | Date }) {
  return <Text>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))}</Text>;
}

export function AppEmptyState({ title, message }: { title: string; message?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: "center", padding: 28, gap: 8 }}>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>{title}</Text>
      {message ? <Text style={{ color: theme.muted, textAlign: "center" }}>{message}</Text> : null}
    </View>
  );
}

export function AppErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <AppCard>
      <AppBadge label="Não foi possível carregar" tone="danger" />
      <Text>{message ?? "Tente novamente em alguns instantes."}</Text>
      <AppButton title="Tentar novamente" onPress={onRetry} variant="secondary" />
    </AppCard>
  );
}

export function AppSkeleton() {
  const { theme } = useTheme();
  return <View accessibilityLabel="Carregando" style={{ height: 92, borderRadius: 16, backgroundColor: theme.border, opacity: 0.6 }} />;
}

export function AppSection({ title, children }: PropsWithChildren<{ title: string }>) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>{title}</Text>
      {children}
    </View>
  );
}

export function AppSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppButton
        title={`${label}: ${options.find((item) => item.value === value)?.label ?? "Selecionar"}`}
        variant="secondary"
        onPress={() => setOpen(true)}
      />
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 24 }} onPress={() => setOpen(false)}>
          <AppCard>
            {options.map((option) => (
              <AppListItem key={option.value} title={option.label} onPress={() => { onChange(option.value); setOpen(false); }} />
            ))}
          </AppCard>
        </Pressable>
      </Modal>
    </>
  );
}

export function AppConfirmationSheet({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#0008", padding: 16 }}>
        <AppCard>
          <Text style={{ fontSize: 20, fontWeight: "800" }}>{title}</Text>
          <Text>{message}</Text>
          <AppButton title="Confirmar" onPress={onConfirm} />
          <AppButton title="Cancelar" onPress={onCancel} variant="secondary" />
        </AppCard>
      </View>
    </Modal>
  );
}

export function AppToast({ message, tone = "success" }: { message: string; tone?: "success" | "danger" }) {
  return <AppBadge label={message} tone={tone} />;
}

export function AppOfflineBanner() {
  return <AppBadge label="Modo offline" tone="warning" />;
}
