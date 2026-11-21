import type { TextStyle, ViewStyle } from 'react-native';

export type KanbanColorScheme = 'light' | 'dark';

/** `auto` follows the device's light/dark setting. */
export type KanbanThemePreset = 'light' | 'dark' | 'auto';

/** `compact` tightens spacing and type for dense boards. */
export type KanbanDensity = 'comfortable' | 'compact';

export interface KanbanThemeColors {
  /** Board background behind the columns. */
  background: string;
  column: string;
  columnTitle: string;
  card: string;
  cardTitle: string;
  cardDescription: string;
  countBadge: string;
  countBadgeText: string;
  border: string;
  /** Brand color for interactive bits (buttons, focus, drop indicators). */
  accent: string;
  /** Text and icons drawn on top of `accent`. */
  onAccent: string;
  emptyColumnText: string;
  /** Fill for the drop placeholder while dragging (used from 0.2.0). */
  placeholder: string;
}

export interface KanbanThemeSpacing {
  /** Padding around the whole board. */
  boardPadding: number;
  /** Horizontal gap between columns. */
  columnGap: number;
  /** Padding inside each column. */
  columnPadding: number;
  /** Vertical gap between cards. */
  cardGap: number;
  /** Padding inside each card. */
  cardPadding: number;
}

export interface KanbanThemeRadius {
  column: number;
  card: number;
  badge: number;
}

export type KanbanTextStyle = Pick<
  TextStyle,
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'fontStyle'
  | 'lineHeight'
  | 'letterSpacing'
  | 'textTransform'
>;

export interface KanbanThemeTypography {
  columnTitle: KanbanTextStyle;
  cardTitle: KanbanTextStyle;
  cardDescription: KanbanTextStyle;
  countBadge: KanbanTextStyle;
  emptyColumn: KanbanTextStyle;
}

export interface KanbanThemeShadows {
  card: ViewStyle;
  /** Shadow of the card while it's being dragged. */
  cardDragging: ViewStyle;
}

/** A fully resolved theme, as returned by `useKanbanTheme()`. */
export interface KanbanTheme {
  scheme: KanbanColorScheme;
  density: KanbanDensity;
  colors: KanbanThemeColors;
  spacing: KanbanThemeSpacing;
  radius: KanbanThemeRadius;
  typography: KanbanThemeTypography;
  shadows: KanbanThemeShadows;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type KanbanThemeTokens = Omit<KanbanTheme, 'scheme' | 'density'>;

/** Any subset of theme tokens. Nested objects are merged, not replaced. */
export type KanbanThemeOverrides = DeepPartial<KanbanThemeTokens>;

/**
 * Custom theme for `<Board theme={...} />`.
 *
 * @example
 * theme={{
 *   base: 'auto',
 *   colors: { accent: '#7C3AED' },
 *   dark: { colors: { background: '#000000' } },
 * }}
 */
export interface KanbanThemeInput extends KanbanThemeOverrides {
  /** Preset to start from. Defaults to `'light'`. */
  base?: KanbanThemePreset;
  /** Overrides applied only when the resolved scheme is light. */
  light?: KanbanThemeOverrides;
  /** Overrides applied only when the resolved scheme is dark. */
  dark?: KanbanThemeOverrides;
}

export type KanbanThemeProp = KanbanThemePreset | KanbanThemeInput;
