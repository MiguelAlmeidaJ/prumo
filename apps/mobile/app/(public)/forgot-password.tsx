import { router } from "expo-router";
import { useState } from "react";
import {
  AppButton,
  AppHeader,
  AppInput,
  AppScreen,
  AppToast,
} from "@/design/components";
import { authApi } from "@/lib/auth-api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await authApi.forgotPassword({ email });
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível solicitar a recuperação.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <AppHeader
        title="Recuperar acesso"
        subtitle="Enviaremos as instruções se o e-mail estiver cadastrado."
      />
      {sent ? (
        <AppToast
          message="Se houver uma conta para este e-mail, o link de recuperação foi enviado."
          tone="success"
        />
      ) : (
        <>
          <AppInput
            label="E-mail"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError(null);
            }}
            keyboardType="email-address"
          />
          {error ? <AppToast message={error} tone="danger" /> : null}
          <AppButton
            title="Enviar instruções"
            loading={submitting}
            disabled={!email.includes("@")}
            onPress={() => void submit()}
          />
        </>
      )}
      <AppButton
        title="Voltar para entrar"
        onPress={() => router.replace("/(public)/login")}
      />
    </AppScreen>
  );
}
