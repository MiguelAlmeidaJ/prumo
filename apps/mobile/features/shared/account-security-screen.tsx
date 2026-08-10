import type { ActionMessage } from "@prumo/contracts";
import { useState } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/auth/auth-context";
import {
  AppButton,
  AppHeader,
  AppPasswordInput,
  AppScreen,
  AppToast,
} from "@/design/components";

export function AccountSecurityScreen() {
  const { request, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (newPassword !== confirmation) {
      setError("As novas senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await request<ActionMessage>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      Alert.alert(
        "Senha alterada",
        "Por segurança, entre novamente com a nova senha.",
      );
      await logout();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível alterar a senha.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <AppHeader
        title="Segurança da conta"
        subtitle="A alteração encerra as outras sessões abertas."
      />
      <AppPasswordInput
        label="Senha atual"
        value={currentPassword}
        onChangeText={setCurrentPassword}
      />
      <AppPasswordInput
        label="Nova senha"
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <AppPasswordInput
        label="Confirmar nova senha"
        value={confirmation}
        onChangeText={setConfirmation}
      />
      {error ? <AppToast message={error} tone="danger" /> : null}
      <AppButton
        title="Alterar senha"
        loading={submitting}
        disabled={
          currentPassword.length < 8 ||
          newPassword.length < 12 ||
          confirmation.length < 12
        }
        onPress={() => void submit()}
      />
    </AppScreen>
  );
}
