import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type {
  KanbanDensity,
  KanbanTheme,
  KanbanThemeProp,
} from '../theme/types';
import type { KanbanBoard, KanbanCard, KanbanColumn } from '../types';

/** Style overrides for each part of the board. Applied on top of the theme. */
export interface KanbanStyles {
  /** Horizontal scroll content that holds the columns. */
  boardContent?: StyleProp<ViewStyle>;
  column?: StyleProp<ViewStyle>;
  columnHeader?: StyleProp<ViewStyle>;
  columnTitle?: StyleProp<TextStyle>;
  countBadge?: StyleProp<ViewStyle>;
  countBadgeText?: StyleProp<TextStyle>;
  /** Vertical scroll content that holds a column's cards. */
  columnContent?: StyleProp<ViewStyle>;
  columnFooter?: StyleProp<ViewStyle>;
  card?: StyleProp<ViewStyle>;
  cardTitle?: StyleProp<TextStyle>;
  cardDescription?: StyleProp<TextStyle>;
  emptyColumn?: StyleProp<ViewStyle>;
  emptyColumnText?: StyleProp<TextStyle>;
}

/** User-facing strings, for translation. */
export interface KanbanLabels {
  /** Shown in a column with no cards. */
  emptyColumn: string;
}

export interface CardRenderInfo<TColumn> {
  /** The column the card is in. */
  column: TColumn;
  /** The card's index within its column. */
  index: number;
  theme: KanbanTheme;
}

export interface ColumnRenderInfo {
  /** The column's index on the board. */
  index: number;
  cardCount: number;
  theme: KanbanTheme;
}

export interface BoardProps<
  TCard extends KanbanCard = KanbanCard,
  TColumn extends KanbanColumn<TCard> = KanbanColumn<TCard>,
> {
  /** The board to display. */
  board: KanbanBoard<TCard, TColumn>;

  /**
   * `'light'` (default), `'dark'`, `'auto'` (follows the device), or a custom
   * theme object. See `KanbanThemeInput`.
   */
  theme?: KanbanThemeProp;
  /** `'comfortable'` (default) or `'compact'`. */
  density?: KanbanDensity;
  /**
   * Column width in points, or `'fullScreen'` to show one column per screen
   * (great on phones). Defaults to 280 (240 when compact).
   */
  columnWidth?: number | 'fullScreen';
  /**
   * `'content'` (default): columns are as tall as their cards and scroll once
   * they reach the bottom of the board, keeping the footer under the last card.
   * `'fill'`: every column stretches to the full board height.
   */
  columnHeight?: 'content' | 'fill';
  /** Snap scrolling to columns. Defaults to `true` for `'fullScreen'`. */
  snapToColumns?: boolean;
  /** Show the card count next to each column title. Defaults to `true`. */
  showCardCount?: boolean;
  /** Style overrides for each part of the board. */
  styles?: KanbanStyles;
  /** Override user-facing strings. */
  labels?: Partial<KanbanLabels>;

  /** Replace the default card. Wrap in `useCallback` to keep cards memoized. */
  renderCard?: (card: TCard, info: CardRenderInfo<TColumn>) => ReactNode;
  /** Replace the default column header (title + count). */
  renderColumnHeader?: (column: TColumn, info: ColumnRenderInfo) => ReactNode;
  /** Render something under a column's cards, e.g. an "Add card" button. */
  renderColumnFooter?: (column: TColumn, info: ColumnRenderInfo) => ReactNode;
  /** Replace the default "No cards" placeholder. */
  renderEmptyColumn?: (column: TColumn, info: ColumnRenderInfo) => ReactNode;

  /** Called when a card is tapped. Makes cards pressable buttons. */
  onCardPress?: (card: TCard, info: CardRenderInfo<TColumn>) => void;

  /** Style for the outer container. The board fills its parent by default. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
