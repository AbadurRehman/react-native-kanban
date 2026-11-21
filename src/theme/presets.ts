import type {
  KanbanDensity,
  KanbanTheme,
  KanbanThemeColors,
  KanbanThemeOverrides,
} from './types';

const lightColors: KanbanThemeColors = {
  background: '#F8FAFC',
  column: '#EEF2F6',
  columnTitle: '#0F172A',
  card: '#FFFFFF',
  cardTitle: '#0F172A',
  cardDescription: '#64748B',
  countBadge: '#E2E8F0',
  countBadgeText: '#475569',
  border: '#E2E8F0',
  accent: '#4F46E5',
  emptyColumnText: '#94A3B8',
  placeholder: 'rgba(79, 70, 229, 0.10)',
};

const darkColors: KanbanThemeColors = {
  background: '#0B1120',
  column: '#131C2E',
  columnTitle: '#E2E8F0',
  card: '#1E293B',
  cardTitle: '#F1F5F9',
  cardDescription: '#94A3B8',
  countBadge: '#1E293B',
  countBadgeText: '#CBD5E1',
  border: '#273449',
  accent: '#818CF8',
  emptyColumnText: '#64748B',
  placeholder: 'rgba(129, 140, 248, 0.14)',
};

const comfortable: Omit<KanbanTheme, 'scheme' | 'colors' | 'shadows'> = {
  density: 'comfortable',
  spacing: {
    boardPadding: 16,
    columnGap: 12,
    columnPadding: 12,
    cardGap: 8,
    cardPadding: 12,
  },
  radius: { column: 14, card: 10, badge: 999 },
  typography: {
    columnTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
    cardTitle: { fontSize: 15, fontWeight: '500', lineHeight: 20 },
    cardDescription: { fontSize: 13, lineHeight: 18 },
    countBadge: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
    emptyColumn: { fontSize: 13, lineHeight: 18 },
  },
};

/** Spacing and type adjustments applied on top of a preset for each density. */
export const densityOverrides: Record<KanbanDensity, KanbanThemeOverrides> = {
  comfortable: {},
  compact: {
    spacing: {
      boardPadding: 12,
      columnGap: 8,
      columnPadding: 8,
      cardGap: 6,
      cardPadding: 8,
    },
    radius: { column: 10, card: 8 },
    typography: {
      columnTitle: { fontSize: 14, lineHeight: 18 },
      cardTitle: { fontSize: 13, lineHeight: 18 },
      cardDescription: { fontSize: 12, lineHeight: 16 },
      countBadge: { fontSize: 11, lineHeight: 14 },
      emptyColumn: { fontSize: 12, lineHeight: 16 },
    },
  },
};

export const lightTheme: KanbanTheme = {
  scheme: 'light',
  ...comfortable,
  colors: lightColors,
  shadows: {
    card: {
      boxShadow:
        '0px 1px 2px rgba(15, 23, 42, 0.08), 0px 1px 1px rgba(15, 23, 42, 0.04)',
    },
  },
};

export const darkTheme: KanbanTheme = {
  scheme: 'dark',
  ...comfortable,
  colors: darkColors,
  shadows: {
    card: { boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.45)' },
  },
};
