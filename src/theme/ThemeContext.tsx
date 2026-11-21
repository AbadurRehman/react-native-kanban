import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { createKanbanTheme } from './createKanbanTheme';
import { lightTheme } from './presets';
import type { KanbanDensity, KanbanTheme, KanbanThemeProp } from './types';

const KanbanThemeContext = createContext<KanbanTheme>(lightTheme);

export const KanbanThemeProvider = KanbanThemeContext.Provider;

/**
 * The board's resolved theme. Use it inside `renderCard` and other render
 * props so custom UI matches the board (including light/dark switching).
 */
export function useKanbanTheme(): KanbanTheme {
  return useContext(KanbanThemeContext);
}

/** Resolves a theme prop, following the device scheme for `'auto'`. */
export function useResolvedKanbanTheme(
  theme: KanbanThemeProp | undefined,
  density: KanbanDensity | undefined
): KanbanTheme {
  const systemColorScheme = useColorScheme();
  const scheme = systemColorScheme === 'dark' ? 'dark' : 'light';
  // Themes are plain data, so a serialized key keeps the resolved theme stable
  // when callers pass a new inline object with the same values every render.
  const key = typeof theme === 'string' ? theme : JSON.stringify(theme ?? null);

  return useMemo(
    () => createKanbanTheme(theme, { systemColorScheme: scheme, density }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, scheme, density]
  );
}
