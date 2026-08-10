import { useAuth } from "@/auth/auth-context";
import { AppButton, AppHeader, AppScreen } from "@/design/components";
export default function UnsupportedRole() {
  const { logout } = useAuth();
  return <AppScreen><AppHeader title="Perfil não disponível" subtitle="O aplicativo móvel está disponível para alunos e instrutores." /><AppButton title="Sair" onPress={() => void logout()} /></AppScreen>;
}
