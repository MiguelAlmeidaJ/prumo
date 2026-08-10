import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Página não encontrada" }} />
      <View style={styles.container}>
        <Text style={styles.title}>Esta tela não existe.</Text>
        <Link href="/" style={styles.link}>
          Voltar para o início
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6F9",
    padding: 20,
  },
  title: {
    color: "#13213C",
    fontSize: 20,
    fontWeight: "800",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
    color: "#2457D6",
    fontSize: 14,
    fontWeight: "700",
  },
});
