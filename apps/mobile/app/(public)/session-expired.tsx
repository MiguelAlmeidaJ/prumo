import { router } from "expo-router";
import { AppButton, AppHeader, AppScreen } from "@/design/components";
export default function SessionExpired() {
  return <AppScreen><AppHeader title="Sessão expirada" subtitle="Entre novamente para continuar com segurança." /><AppButton title="Entrar novamente" onPress={() => router.replace("/(public)/login")} /></AppScreen>;
}
