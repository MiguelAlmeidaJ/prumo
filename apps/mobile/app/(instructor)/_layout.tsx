import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/auth/auth-context";

export default function InstructorLayout() {
  const { status, session } = useAuth();
  if (status === "booting") return null;
  if (!session) return <Redirect href="/(public)/login" />;
  if (session.activeMembership.role !== "INSTRUCTOR")
    return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarActiveTintColor: "#145C52" }}
    >
      <Tabs.Screen name="index" options={{ title: "Início" }} />
      <Tabs.Screen name="schedule/index" options={{ title: "Agenda" }} />
      <Tabs.Screen name="lessons/index" options={{ title: "Aulas" }} />
      <Tabs.Screen name="students/index" options={{ title: "Alunos" }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
      <Tabs.Screen name="security" options={{ href: null }} />
      <Tabs.Screen name="schedule/[id]" options={{ href: null }} />
      <Tabs.Screen name="lessons/[id]" options={{ href: null }} />
      <Tabs.Screen name="theoretical-classes/index" options={{ href: null }} />
      <Tabs.Screen name="theoretical-classes/[id]" options={{ href: null }} />
      <Tabs.Screen name="students/[id]" options={{ href: null }} />
      <Tabs.Screen name="vehicles/index" options={{ href: null }} />
      <Tabs.Screen name="vehicles/[id]" options={{ href: null }} />
      <Tabs.Screen name="notifications/index" options={{ href: null }} />
      <Tabs.Screen name="notifications/settings" options={{ href: null }} />
    </Tabs>
  );
}
