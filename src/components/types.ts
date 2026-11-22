import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type {
  KanbanDensity,
  KanbanTheme,
  KanbanThemeProp,
} from '../theme/types';
import type {
  CardDestination,
  CardSource,
  ColumnDestination,
  ColumnSource,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
} from '../types';

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
  /** Marks where a dragged card will land. */
  placeholder?: StyleProp<ViewStyle>;
  /** Wrapper around the card that follows the finger while dragging. */
  dragOverlay?: StyleProp<ViewStyle>;
  /** Marks where a dragged column will land. */
  columnPlaceholder?: StyleProp<ViewStyle>;
  /** The column copy that follows the finger while dragging a column. */
  columnDragOverlay?: StyleProp<ViewStyle>;
}

/** User-facing strings, for translation. */
export interface KanbanLabels {
  /** Shown in a column with no cards. */
  emptyColumn: string;

  // Screen readers. Functions get plain strings (titles, 1-based positions),
  // so they're easy to translate.
  /** A card's place, read after its text: "2 of 5 in To do". */
  cardPosition: (info: {
    position: number;
    count: number;
    column: string;
  }) => string;
  /** A column's card count, read in its header: "5 cards". */
  cardCount: (count: number) => string;
  /** Card actions. */
  moveCardUp: string;
  moveCardDown: string;
  moveCardToColumn: (column: string) => string;
  /** Column header actions. */
  moveColumnBefore: (column: string) => string;
  moveColumnAfter: (column: string) => string;
  /** Announced after a move made with an action. */
  cardMoved: (info: {
    card: string;
    column: string;
    position: number;
    count: number;
  }) => string;
  columnMoved: (info: {
    column: string;
    position: number;
    count: number;
  }) => string;
}

/** How a move happened: a drag, or a screen-reader action. */
export type KanbanMoveSource = 'drag' | 'accessibility';

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

/** How a lifted card looks while it follows the finger. */
export interface KanbanDragStyle {
  /** Size of the floating card at full lift. `1.03` by default; `1` keeps its size. */
  scale?: number;
  /** Tilt at full lift, in degrees. `2` by default; `0` keeps it straight. */
  rotation?: number;
  /** Opacity of the floating card, from 0 to 1. `1` by default. */
  opacity?: number;
}

/** Auto-scroll while a dragged card is near the edge of a column or the board. */
export interface KanbanAutoScroll {
  /**
   * How close to an edge scrolling starts, in points. Defaults to 64 at the
   * board's left and right edges and 56 at a column's top and bottom.
   */
  edge?: number;
  /** Top speed, in points per 60 fps frame. `14` by default. */
  speed?: number;
}

export interface PlaceholderRenderInfo<TCard> {
  /** The card being dragged. */
  card: TCard;
  /** Height of the landing spot: the dragged card's height. */
  height: number;
  theme: KanbanTheme;
}

export interface CardDropCheck<TCard, TColumn> {
  /** The card being dragged. */
  card: TCard;
  /** The column it was lifted from. */
  fromColumn: TColumn;
  /** The column it would be dropped into. */
  toColumn: TColumn;
}

export interface CardDragStartEvent<TCard> {
  card: TCard;
  source: CardSource;
}

export interface CardDragEndEvent<TCard> extends CardDragStartEvent<TCard> {
  /**
   * Where the card was dropped. Equal to the source position when the card
   * was put back where it started.
   */
  destination: CardDestination;
  /** `'accessibility'` when the card was moved with a screen-reader action. */
  via: KanbanMoveSource;
}

export interface ColumnDragStartEvent<TColumn> {
  column: TColumn;
  source: ColumnSource;
}

export interface ColumnDragEndEvent<
  TColumn,
> extends ColumnDragStartEvent<TColumn> {
  /**
   * The column's new index. Equal to the source position when the column was
   * put back where it started.
   */
  destination: ColumnDestination;
  /** `'accessibility'` when the column was moved with a screen-reader action. */
  via: KanbanMoveSource;
}

/**
 * Controlled: pass `board` and apply drops yourself in `onCardDragEnd`
 * (e.g. with `moveCard`). Uncontrolled: pass `initialBoard` and the board
 * keeps its own state, reporting changes through `onBoardChange`.
 */
export type BoardDataProps<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
> =
  | {
      /** The board to display (controlled). */
      board: KanbanBoard<TCard, TColumn>;
      initialBoard?: never;
      onBoardChange?: never;
    }
  | {
      /** The starting board; the component keeps its own state (uncontrolled). */
      initialBoard: KanbanBoard<TCard, TColumn>;
      /** Called with the new board after each drop that changes it. */
      onBoardChange?: (board: KanbanBoard<TCard, TColumn>) => void;
      board?: never;
    };

export type BoardProps<
  TCard extends KanbanCard = KanbanCard,
  TColumn extends KanbanColumn<TCard> = KanbanColumn<TCard>,
> = BoardBaseProps<TCard, TColumn> & BoardDataProps<TCard, TColumn>;

export interface BoardBaseProps<
  TCard extends KanbanCard = KanbanCard,
  TColumn extends KanbanColumn<TCard> = KanbanColumn<TCard>,
> {
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

  /** Turn off long-press dragging. */
  disableCardDrag?: boolean;
  /**
   * How long a card must be pressed before it lifts, in ms. `300` by default.
   * `0` lifts it on the first movement instead; columns can then only be
   * scrolled from outside the cards.
   */
  dragActivationDelay?: number;
  /** Return `false` to lock a card in place. */
  canDragCard?: (card: TCard, column: TColumn) => boolean;
  /**
   * Return `false` to keep a card out of a column. Checked once per column
   * when a drag starts. A blocked column shows no landing spot, and dropping
   * there puts the card back.
   */
  canDropCard?: (check: CardDropCheck<TCard, TColumn>) => boolean;
  /** How the floating card looks: lift scale, tilt and opacity. */
  dragStyle?: KanbanDragStyle;
  /**
   * Replace the floating card. By default it is the card itself, as drawn by
   * `renderCard`.
   */
  renderDragPreview?: (card: TCard, info: CardRenderInfo<TColumn>) => ReactNode;
  /**
   * Replace the landing spot's dashed box. It is shown at the dragged card's
   * height; fill it (`flex: 1`) to match.
   */
  renderPlaceholder?: (info: PlaceholderRenderInfo<TCard>) => ReactNode;
  /** Scroll near edges while dragging. `true` by default; `false` turns it off. */
  autoScroll?: boolean | KanbanAutoScroll;
  /** Called when a card lifts. A good place for haptic feedback. */
  onCardDragStart?: (event: CardDragStartEvent<TCard>) => void;
  /**
   * Called when a dragged card is dropped. In controlled mode, update your
   * board here (`moveCard(board, source, destination)`), or the card goes back.
   */
  onCardDragEnd?: (event: CardDragEndEvent<TCard>) => void;

  /**
   * Render only the cards near each column's viewport (about a screen above
   * and below), so large boards mount and drag quickly. `true` by default;
   * `false` keeps every card mounted.
   */
  virtualize?: boolean;
  /**
   * Height assumed for cards that haven't been rendered yet, for scroll size
   * and drop positions. Defaults to the average of the measured cards.
   */
  estimatedCardHeight?: number;

  /**
   * Turn off the screen-reader actions. By default each card is one
   * screen-reader element (its text is read together, then its position)
   * with Move up / Move down / Move to ‹column› actions, and column headers
   * get Move before / after ‹column›. Turn this off if your cards contain
   * buttons that screen readers must reach on their own.
   */
  disableAccessibilityActions?: boolean;

  /**
   * Layout direction. `'rtl'` puts the first column on the right and mirrors
   * dragging and auto-scroll. Defaults to the app's direction
   * (`I18nManager.isRTL`); set it on web, where that is always LTR.
   */
  direction?: 'ltr' | 'rtl';

  /** Turn off dragging columns by their header. */
  disableColumnDrag?: boolean;
  /**
   * Return `false` to lock a column's header. Other columns can still be
   * dropped before or after it.
   */
  canDragColumn?: (column: TColumn) => boolean;
  /** Called when a column lifts. */
  onColumnDragStart?: (event: ColumnDragStartEvent<TColumn>) => void;
  /**
   * Called when a dragged column is dropped. In controlled mode, update your
   * board here (`moveColumn(board, source, destination)`), or it goes back.
   */
  onColumnDragEnd?: (event: ColumnDragEndEvent<TColumn>) => void;

  /** Style for the outer container. The board fills its parent by default. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
