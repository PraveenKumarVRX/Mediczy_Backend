/**
 * One palette, two themes. app.json sets userInterfaceStyle: "automatic", so
 * the device decides; every colour here has a light and a dark value and no
 * screen hard-codes one.
 */
import { useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
}

const light: Theme = {
  dark: false,
  bg: '#f4f6f9',
  surface: '#ffffff',
  surfaceAlt: '#eef2f7',
  border: '#d7dee8',
  text: '#0f172a',
  textMuted: '#5a6882',
  accent: '#0b7ea8',
  accentText: '#ffffff',
  accentSoft: '#e2f1f8',
  success: '#17663f',
  successSoft: '#e0f2e7',
  warning: '#8a5300',
  warningSoft: '#fcefdc',
  danger: '#a4232b',
  dangerSoft: '#fbe6e7',
};

const dark: Theme = {
  dark: true,
  bg: '#0d1218',
  surface: '#161d26',
  surfaceAlt: '#1e2733',
  border: '#2c3845',
  text: '#eef2f7',
  textMuted: '#9babc0',
  accent: '#53bde3',
  accentText: '#07222e',
  accentSoft: '#13303d',
  success: '#6cd79c',
  successSoft: '#13302270',
  warning: '#f0b459',
  warningSoft: '#33250e',
  danger: '#f1868d',
  dangerSoft: '#3a1b1e',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const type = {
  display: { fontSize: 26, fontWeight: '700' as const },
  title: { fontSize: 20, fontWeight: '700' as const },
  heading: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
};
