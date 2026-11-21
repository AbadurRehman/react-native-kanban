import { darkTheme, densityOverrides, lightTheme } from './presets';
import type {
  KanbanColorScheme,
  KanbanDensity,
  KanbanTheme,
  KanbanThemeOverrides,
  KanbanThemeProp,
} from './types';

export interface CreateKanbanThemeOptions {
  /** The device scheme, used when the theme is `'auto'`. Defaults to light. */
  systemColorScheme?: KanbanColorScheme | null;
  density?: KanbanDensity;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

/** Recursively merges plain objects. Arrays and other values are replaced. */
export function deepMerge<T extends object>(target: T, source: unknown): T {
  if (!isPlainObject(source)) return target;
  const result: Record<string, unknown> = { ...(target as object) };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] =
      isPlainObject(value) && isPlainObject(current)
        ? deepMerge(current, value)
        : value;
  }
  return result as T;
}

/**
 * Resolves a theme prop into a complete theme.
 *
 * Order: preset → density → shared overrides → light/dark-only overrides.
 */
export function createKanbanTheme(
  theme: KanbanThemeProp = 'light',
  options: CreateKanbanThemeOptions = {}
): KanbanTheme {
  const density = options.density ?? 'comfortable';
  const input = typeof theme === 'string' ? { base: theme } : theme;
  const { base = 'light', light, dark, ...shared } = input;

  const scheme: KanbanColorScheme =
    base === 'auto' ? (options.systemColorScheme ?? 'light') : base;
  const preset = scheme === 'dark' ? darkTheme : lightTheme;

  let resolved = deepMerge(preset, densityOverrides[density]);
  resolved = deepMerge(resolved, shared as KanbanThemeOverrides);
  resolved = deepMerge(resolved, scheme === 'dark' ? dark : light);

  return { ...resolved, scheme, density };
}
