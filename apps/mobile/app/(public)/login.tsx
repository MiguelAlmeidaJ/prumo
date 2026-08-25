import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/auth-context";
import { BrandLogo } from "@/components/brand-logo";
import {
  AppButton,
  AppHeader,
  AppInput,
  AppPasswordInput,
  AppScreen,
  AppToast,
} from "@/design/components";

export default function Login() {
  const { login, error, isSubmitting, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <AppScreen>
      <View style={{ alignItems: "center", paddingVertical: 12 }}>
        <BrandLogo width={240} />
      </View>
      <AppHeader
        title="Acesse sua autoescola"
        subtitle="Entre com os dados da sua conta."
      />
      <AppInput
        label="E-mail"
        value={email}
        onChangeText={(value) => {
          clearError();
          setEmail(value);
        }}
        keyboardType="email-address"
      />
      <AppPasswordInput
        label="Senha"
        value={password}
        onChangeText={(value) => {
          clearError();
          setPassword(value);
        }}
      />
      {error ? <AppToast message={error} tone="danger" /> : null}
      <AppButton
        title="Entrar"
        loading={isSubmitting}
        disabled={!email.includes("@") || password.length < 8}
        onPress={() => void login({ email, password })}
      />
      <AppButton
        title="Esqueci minha senha"
        variant="secondary"
        onPress={() => router.push("/(public)/forgot-password")}
      />
      <Text>
        Seu tenant é determinado pela associação validada da sua conta.
      </Text>
    </AppScreen>
  );
}
