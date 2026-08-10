import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useColorScheme } from "react-native";

const palettes = {
  light: {
    background: "#F5F7FA",
    surface: "#FFFFFF",
    text: "#172033",
    muted: "#667085",
    primary: "#145C52",
    primaryText: "#FFFFFF",
    border: "#D7DEE7",
    success: "#176B45",
    warning: "#9A5B13",
    danger: "#B42318",
  },
  dark: {
    background: "#0D1520",
    surface: "#172131",
    text: "#F5F7FA",
    muted: "#AAB4C3",
    primary: "#5AD6C5",
    primaryText: "#08221E",
    border: "#344054",
    success: "#6CE9A6",
    warning: "#FEC84B",
    danger: "#FDA29B",
  },
};

export type Theme = (typeof palettes)["light"];
type Mode = "system" | "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  mode: Mode;
  setMode: (mode: Mode) => void;
} | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [mode, setMode] = useState<Mode>("system");
  const selected = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  const value = useMemo(
    () => ({ theme: palettes[selected], mode, setMode }),
    [mode, selected],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider ausente.");
  return value;
}
