import { describe, expect, it } from '@jest/globals';
import { createKanbanTheme, darkTheme, deepMerge, lightTheme } from '../theme';

describe('createKanbanTheme', () => {
  it('defaults to the light, comfortable preset', () => {
    expect(createKanbanTheme()).toEqual(lightTheme);
  });

  it('resolves preset names', () => {
    expect(createKanbanTheme('dark')).toEqual(darkTheme);
    expect(createKanbanTheme('light').colors).toEqual(lightTheme.colors);
  });

  it('follows the system scheme for auto', () => {
    expect(
      createKanbanTheme('auto', { systemColorScheme: 'dark' }).scheme
    ).toBe('dark');
    expect(
      createKanbanTheme('auto', { systemColorScheme: 'light' }).scheme
    ).toBe('light');
    expect(createKanbanTheme('auto', { systemColorScheme: null }).scheme).toBe(
      'light'
    );
  });

  it('applies compact density without touching colors', () => {
    const theme = createKanbanTheme('light', { density: 'compact' });
    expect(theme.density).toBe('compact');
    expect(theme.spacing.cardPadding).toBeLessThan(
      lightTheme.spacing.cardPadding
    );
    expect(theme.typography.cardTitle.fontSize).toBeLessThan(
      lightTheme.typography.cardTitle.fontSize!
    );
    // Untouched typography keys survive the merge.
    expect(theme.typography.cardTitle.fontWeight).toBe(
      lightTheme.typography.cardTitle.fontWeight
    );
    expect(theme.colors).toEqual(lightTheme.colors);
  });

  it('deep-merges overrides onto the base preset', () => {
    const theme = createKanbanTheme({
      base: 'dark',
      colors: { accent: '#FF0000' },
      typography: { cardTitle: { fontFamily: 'Inter' } },
    });
    expect(theme.scheme).toBe('dark');
    expect(theme.colors.accent).toBe('#FF0000');
    expect(theme.colors.card).toBe(darkTheme.colors.card);
    expect(theme.typography.cardTitle).toEqual({
      ...darkTheme.typography.cardTitle,
      fontFamily: 'Inter',
    });
  });

  it('applies light- or dark-only overrides for the resolved scheme', () => {
    const input = {
      base: 'auto' as const,
      colors: { accent: '#7C3AED' },
      dark: { colors: { background: '#000000' } },
      light: { colors: { background: '#FFFFFF' } },
    };
    const dark = createKanbanTheme(input, { systemColorScheme: 'dark' });
    expect(dark.colors.background).toBe('#000000');
    expect(dark.colors.accent).toBe('#7C3AED');

    const light = createKanbanTheme(input, { systemColorScheme: 'light' });
    expect(light.colors.background).toBe('#FFFFFF');
  });

  it('user overrides win over density', () => {
    const theme = createKanbanTheme(
      { spacing: { cardPadding: 20 } },
      { density: 'compact' }
    );
    expect(theme.spacing.cardPadding).toBe(20);
    expect(theme.spacing.cardGap).toBe(6);
  });

  it('never mutates the presets', () => {
    const before = JSON.stringify(lightTheme);
    createKanbanTheme({ colors: { card: 'red' } }, { density: 'compact' });
    expect(JSON.stringify(lightTheme)).toBe(before);
  });
});

describe('deepMerge', () => {
  it('merges plain objects, replaces arrays and skips undefined', () => {
    const merged = deepMerge(
      { a: { b: 1, c: 2 }, list: [1, 2], keep: 'x' },
      { a: { c: 3 }, list: [9], keep: undefined }
    );
    expect(merged).toEqual({ a: { b: 1, c: 3 }, list: [9], keep: 'x' });
  });
});
