import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/auth/auth-context";

export default function StudentLayout() {
  const { status, session } = useAuth();
  if (status === "booting") return null;
  if (!session) return <Redirect href="/(public)/login" />;
  if (session.activeMembership.role !== "STUDENT") return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarActiveTintColor: "#145C52" }}
    >
      <Tabs.Screen name="index" options={{ title: "Início" }} />
      <Tabs.Screen name="schedule/index" options={{ title: "Agenda" }} />
      <Tabs.Screen name="lessons/index" options={{ title: "Aulas" }} />
      <Tabs.Screen name="processes/index" options={{ title: "Processo" }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
      <Tabs.Screen name="security" options={{ href: null }} />
      <Tabs.Screen name="schedule/[id]" options={{ href: null }} />
      <Tabs.Screen name="lessons/[id]" options={{ href: null }} />
      <Tabs.Screen name="processes/[id]" options={{ href: null }} />
      <Tabs.Screen name="exams/index" options={{ href: null }} />
      <Tabs.Screen name="exams/[id]" options={{ href: null }} />
      <Tabs.Screen name="financial/index" options={{ href: null }} />
      <Tabs.Screen name="financial/contracts/[id]" options={{ href: null }} />
      <Tabs.Screen
        name="financial/installments/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen name="financial/payments/[id]" options={{ href: null }} />
      <Tabs.Screen name="documents/index" options={{ href: null }} />
      <Tabs.Screen name="documents/[id]" options={{ href: null }} />
      <Tabs.Screen name="documents/upload" options={{ href: null }} />
      <Tabs.Screen name="notifications/index" options={{ href: null }} />
      <Tabs.Screen name="notifications/settings" options={{ href: null }} />
    </Tabs>
  );
}
