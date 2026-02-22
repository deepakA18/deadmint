export const THEME_NAMES = [
  "default",
  "sega",
  "gameboy",
  "atari",
  "nintendo",
  "arcade",
  "neo-geo",
  "soft-pop",
  "pacman",
  "vhs",
  "cassette",
  "rusty-byte",
  "zelda",
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export interface ThemeConfig {
  name: ThemeName;
  label: string;
  indicatorColor: string;
}

export const THEMES: ThemeConfig[] = [
  { name: "default", label: "Default", indicatorColor: "#7c3aed" },
  { name: "sega", label: "Sega", indicatorColor: "#0055a4" },
  { name: "gameboy", label: "Gameboy", indicatorColor: "#306230" },
  { name: "atari", label: "Atari", indicatorColor: "#a0760a" },
  { name: "nintendo", label: "Nintendo", indicatorColor: "#4b0082" },
  { name: "arcade", label: "Arcade", indicatorColor: "#ff2d95" },
  { name: "neo-geo", label: "Neo-Geo", indicatorColor: "#c0392b" },
  { name: "soft-pop", label: "Soft-Pop", indicatorColor: "#7c5cbf" },
  { name: "pacman", label: "Pacman", indicatorColor: "#e6c619" },
  { name: "vhs", label: "Vhs", indicatorColor: "#b040b0" },
  { name: "cassette", label: "Cassette", indicatorColor: "#b07830" },
  { name: "rusty-byte", label: "Rusty-Byte", indicatorColor: "#c06020" },
  { name: "zelda", label: "Zelda", indicatorColor: "#8fae1b" },
];
