import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import type { KanbanTheme } from '../theme/types';

export type KanbanBaseStyles = {
  boardScroll: ViewStyle;
  boardContent: ViewStyle;
  column: ViewStyle;
  columnHeader: ViewStyle;
  columnTitle: TextStyle;
  countBadge: ViewStyle;
  countBadgeText: TextStyle;
  columnContentHeight: ViewStyle;
  columnScroll: ViewStyle;
  columnScrollFill: ViewStyle;
  columnContent: ViewStyle;
  columnFooter: ViewStyle;
  card: ViewStyle;
  cardTitle: TextStyle;
  cardDescription: TextStyle;
  emptyColumn: ViewStyle;
  emptyColumnText: TextStyle;
  pressed: ViewStyle;
  boardRoot: ViewStyle;
  boardViewport: ViewStyle;
  placeholder: ViewStyle;
  dragOverlay: ViewStyle;
};

/** Default styles for every part of the board, derived from the theme. */
export function createBaseStyles(theme: KanbanTheme): KanbanBaseStyles {
  const { colors, spacing, radius, typography, shadows } = theme;

  return StyleSheet.create<KanbanBaseStyles>({
    boardScroll: {
      flex: 1,
    },
    boardContent: {
      padding: spacing.boardPadding,
      gap: spacing.columnGap,
    },
    column: {
      backgroundColor: colors.column,
      borderRadius: radius.column,
      paddingVertical: spacing.columnPadding,
      gap: spacing.columnPadding,
    },
    columnHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: spacing.columnPadding,
    },
    columnTitle: {
      ...typography.columnTitle,
      color: colors.columnTitle,
      flexShrink: 1,
    },
    countBadge: {
      minWidth: 24,
      paddingHorizontal: 8,
      paddingVertical: 2,
      alignItems: 'center',
      borderRadius: radius.badge,
      backgroundColor: colors.countBadge,
    },
    countBadgeText: {
      ...typography.countBadge,
      color: colors.countBadgeText,
    },
    columnContentHeight: {
      alignSelf: 'flex-start',
    },
    columnScroll: {
      flexGrow: 0,
      flexShrink: 1,
      minHeight: 0,
    },
    columnScrollFill: {
      flex: 1,
    },
    columnContent: {
      gap: spacing.cardGap,
      // Horizontal padding lives here (not on the column) so card shadows
      // aren't clipped by the scroll view's edges.
      paddingHorizontal: spacing.columnPadding,
      paddingBottom: 2,
    },
    columnFooter: {
      paddingHorizontal: spacing.columnPadding,
    },
    card: {
      gap: 4,
      padding: spacing.cardPadding,
      borderRadius: radius.card,
      backgroundColor: colors.card,
      ...shadows.card,
    },
    cardTitle: {
      ...typography.cardTitle,
      color: colors.cardTitle,
    },
    cardDescription: {
      ...typography.cardDescription,
      color: colors.cardDescription,
    },
    emptyColumn: {
      alignItems: 'center',
      paddingVertical: spacing.cardPadding * 2,
      paddingHorizontal: spacing.cardPadding,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: radius.card,
    },
    emptyColumnText: {
      ...typography.emptyColumn,
      color: colors.emptyColumnText,
    },
    pressed: {
      opacity: 0.85,
    },
    boardRoot: {
      flex: 1,
      backgroundColor: colors.background,
    },
    boardViewport: {
      flex: 1,
    },
    placeholder: {
      borderRadius: radius.card,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.accent,
      backgroundColor: colors.placeholder,
    },
    dragOverlay: {
      position: 'absolute',
      left: 0,
      top: 0,
      zIndex: 1000,
      borderRadius: radius.card,
      ...shadows.cardDragging,
    },
  });
}
