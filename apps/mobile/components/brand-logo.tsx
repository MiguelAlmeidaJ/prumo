import { Image } from "react-native";

import { useTheme } from "@/design/theme";

const logos = {
  color: require("@/assets/images/brand/logo-prumo.png"),
  white: require("@/assets/images/brand/logo-prumo-white.png"),
};

export function BrandLogo({
  width = 220,
  variant = "auto",
}: {
  width?: number;
  variant?: "auto" | "color" | "white";
}) {
  const { theme } = useTheme();
  const resolvedVariant =
    variant === "auto"
      ? theme.background === "#0D1520"
        ? "white"
        : "color"
      : variant;

  return (
    <Image
      accessibilityLabel="Prumo"
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={logos[resolvedVariant]}
      style={{ width, height: width * 0.29 }}
    />
  );
}
