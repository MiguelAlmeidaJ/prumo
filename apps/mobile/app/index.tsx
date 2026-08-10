import { Redirect, type Href } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/auth-context";

export default function Index() {
  const { status, session } = useAuth();
  if (status === "booting") {
    return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator size="large" /></View>;
  }
  if (status === "session-expired") return <Redirect href="/(public)/session-expired" />;
  if (status === "selecting-tenant") return <Redirect href="/(public)/select-tenant" />;
  if (!session || status === "signed-out") return <Redirect href="/(public)/login" />;
  if (session.activeMembership.role === "STUDENT") return <Redirect href={"/(student)" as Href} />;
  if (session.activeMembership.role === "INSTRUCTOR") return <Redirect href={"/(instructor)" as Href} />;
  return <Redirect href="/(public)/unsupported-role" />;
}
