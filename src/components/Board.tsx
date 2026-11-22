import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type View,
} from 'react-native';
import {
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { reportDragError } from '../dnd/debug';
import {
  DragProvider,
  useDragContext,
  type DragActions,
  type DragContextValue,
  type DragShared,
} from '../dnd/DragContext';
import { updateColumnTarget, updateDragTarget } from '../dnd/engine';
import {
  resolveActivationDelay,
  resolveAutoScroll,
  resolveDragStyle,
  type ResolvedDragStyle,
} from '../dnd/options';
import {
  autoScrollSpeed,
  buildColumnItems,
  clampScroll,
  keyOf,
  type ColumnLayout,
  type Rect,
} from '../dnd/geometry';
import { A11yProvider, type KanbanA11y } from '../a11y/A11yContext';
import { announce } from '../a11y/announce';
import {
  cardActionTarget,
  cardMoves,
  columnActionTarget,
  titleOf,
  type CardActionName,
  type ColumnActionName,
} from '../a11y/moves';
import { appDirection, leftEdge, swapsLeftAndRight } from '../dnd/direction';
import { moveCard, moveColumn } from '../helpers';
import {
  KanbanThemeProvider,
  useResolvedKanbanTheme,
} from '../theme/ThemeContext';
import type { KanbanTheme } from '../theme/types';
import type {
  CardDestination,
  CardSource,
  ColumnDestination,
  ColumnSource,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
} from '../types';
import { DefaultCard } from './Card';
import { Column } from './Column';
import { ColumnDragOverlay, type VisibleCardRange } from './ColumnDragOverlay';
import { ColumnSpacer } from './ColumnSpacer';
import { createBaseStyles, type KanbanBaseStyles } from './createBaseStyles';
import type {
  BoardBaseProps,
  BoardProps,
  CardDragEndEvent,
  CardDragStartEvent,
  ColumnDragEndEvent,
  ColumnDragStartEvent,
  KanbanLabels,
  KanbanStyles,
} from './types';

const DEFAULT_COLUMN_WIDTH = { comfortable: 280, compact: 240 } as const;

const DEFAULT_LABELS: KanbanLabels = {
  emptyColumn: 'No cards',
  cardPosition: ({ position, count, column }) =>
    `${position} of ${count} in ${column}`,
  cardCount: (count) => (count === 1 ? '1 card' : `${count} cards`),
  moveCardUp: 'Move up',
  moveCardDown: 'Move down',
  moveCardToColumn: (column) => `Move to ${column}`,
  moveColumnBefore: (column) => `Move before ${column}`,
  moveColumnAfter: (column) => `Move after ${column}`,
  cardMoved: ({ card, column, position, count }) =>
    `Moved ${card} to ${column}, ${position} of ${count}`,
  columnMoved: ({ column, position, count }) =>
    `Moved ${column} to position ${position} of ${count}`,
};

/**
 * Labels merged over the defaults. Keeps the same object while the given
 * labels are the same, so an inline `labels={{ ... }}` doesn't re-render
 * every card.
 */
function useLabels(given: Partial<KanbanLabels> | undefined): KanbanLabels {
  const last = useRef<{
    given: Partial<KanbanLabels> | undefined;
    merged: KanbanLabels;
  } | null>(null);
  const previous = last.current;
  if (previous && sameLabels(previous.given, given)) return previous.merged;
  const merged = { ...DEFAULT_LABELS };
  for (const key of Object.keys(given ?? {}) as (keyof KanbanLabels)[]) {
    const value = given![key];
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  last.current = { given, merged };
  return merged;
}

function sameLabels(
  a: Partial<KanbanLabels> | undefined,
  b: Partial<KanbanLabels> | undefined
) {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) {
    const k = key as keyof KanbanLabels;
    if (a?.[k] !== b?.[k]) return false;
  }
  return true;
}

const EMPTY_BOARD = { columns: [] };

interface ActiveDrag<TCard, TColumn> {
  card: TCard;
  column: TColumn;
  sourceColumnKey: string;
  sourceIndex: number;
  width: number;
  height: number;
}

interface ActiveColumnDrag<TColumn> {
  column: TColumn;
  key: string;
  sourceIndex: number;
  width: number;
  height: number;
  cards: VisibleCardRange;
}

interface DropTarget {
  columnKey: string;
  index: number;
}

/**
 * A horizontally scrolling Kanban board with long-press drag and drop.
 *
 * @example
 * // Uncontrolled: the board keeps its own state.
 * <Board initialBoard={board} onBoardChange={save} />
 *
 * // Controlled: you apply each drop.
 * <Board
 *   board={board}
 *   onCardDragEnd={({ source, destination }) =>
 *     setBoard((b) => moveCard(b, source, destination))
 *   }
 * />
 */
export function Board<
  TCard extends KanbanCard = KanbanCard,
  TColumn extends KanbanColumn<TCard> = KanbanColumn<TCard>,
>(props: BoardProps<TCard, TColumn>) {
  const {
    theme: themeProp,
    density,
    columnWidth,
    columnHeight = 'content',
    snapToColumns,
    showCardCount = true,
    styles,
    labels: labelsProp,
    renderCard,
    renderColumnHeader,
    renderColumnFooter,
    renderEmptyColumn,
    onCardPress,
    disableCardDrag = false,
    dragActivationDelay,
    canDragCard,
    canDropCard,
    dragStyle,
    renderDragPreview,
    renderPlaceholder,
    autoScroll,
    onCardDragStart,
    onCardDragEnd,
    virtualize = true,
    estimatedCardHeight,
    disableColumnDrag = false,
    canDragColumn,
    onColumnDragStart,
    onColumnDragEnd,
    disableAccessibilityActions = false,
    direction: directionProp,
    style,
    testID = 'kanban-board',
  } = props;

  // --- Board data: controlled (`board`) or uncontrolled (`initialBoard`) ---
  const isControlled = props.board !== undefined;
  const [internalBoard, setInternalBoard] = useState<
    KanbanBoard<TCard, TColumn>
  >(() => props.initialBoard ?? (EMPTY_BOARD as KanbanBoard<TCard, TColumn>));
  const board = isControlled ? props.board! : internalBoard;

  // --- Theme & styles ---
  const theme = useResolvedKanbanTheme(themeProp, density);
  const base = useMemo(() => createBaseStyles(theme), [theme]);
  const labels = useLabels(labelsProp);

  // --- Shared drag state (UI thread) ---
  const boardRef = useAnimatedRef<View>();
  const boardScrollRef = useAnimatedRef<any>();
  const active = useSharedValue(false);
  const dropping = useSharedValue(false);
  const draggedKey = useSharedValue<string | null>(null);
  const fingerX = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const boardPageX = useSharedValue(0);
  const boardPageY = useSharedValue(0);
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const overlayX = useSharedValue(0);
  const overlayY = useSharedValue(0);
  const lift = useSharedValue(0);
  const layouts = useSharedValue<Record<string, ColumnLayout>>({});
  const columnOrder = useSharedValue<string[]>([]);
  const boardScrollX = useSharedValue(0);
  const boardViewportWidth = useSharedValue(0);
  const boardContentWidth = useSharedValue(0);
  const direction = directionProp ?? appDirection();
  const isRTL = direction === 'rtl';
  const rtl = useSharedValue(isRTL);
  useEffect(() => {
    rtl.value = isRTL;
  }, [rtl, isRTL]);
  const targetKey = useSharedValue<string | null>(null);
  const targetIndex = useSharedValue(0);
  const sourceKey = useSharedValue<string | null>(null);
  const sourceIndex = useSharedValue(0);
  const dropBlocked = useSharedValue<Record<string, boolean>>({});
  const draggedRect = useSharedValue<Rect | null>(null);
  const space = useSharedValue(0);
  const contentLeft = useSharedValue(theme.spacing.boardPadding);
  const columnStep = useSharedValue(0);
  const columnWidthValue = useSharedValue(0);
  const colActive = useSharedValue(false);
  const colDropping = useSharedValue(false);
  const colDraggedKey = useSharedValue<string | null>(null);
  const colSourceIndex = useSharedValue(0);
  const colTargetIndex = useSharedValue(0);
  const colGrabX = useSharedValue(0);
  const colGrabY = useSharedValue(0);
  const colOverlayX = useSharedValue(0);
  const colOverlayY = useSharedValue(0);
  const colStartY = useSharedValue(0);
  const colLift = useSharedValue(0);
  const cardGap = useSharedValue(theme.spacing.cardGap);
  const cardInset = useSharedValue(theme.spacing.columnPadding);
  useEffect(() => {
    cardGap.value = theme.spacing.cardGap;
    cardInset.value = theme.spacing.columnPadding;
  }, [theme, cardGap, cardInset]);

  // Auto-scroll settings, read by the frame loops on the UI thread.
  const scrolling = resolveAutoScroll(autoScroll);
  const scrollEdgeX = useSharedValue(scrolling.edgeX);
  const scrollEdgeY = useSharedValue(scrolling.edgeY);
  const scrollSpeed = useSharedValue(scrolling.speed);
  useEffect(() => {
    scrollEdgeX.value = scrolling.edgeX;
    scrollEdgeY.value = scrolling.edgeY;
    scrollSpeed.value = scrolling.speed;
  }, [
    scrolling.edgeX,
    scrolling.edgeY,
    scrolling.speed,
    scrollEdgeX,
    scrollEdgeY,
    scrollSpeed,
  ]);

  const shared = useMemo<DragShared>(
    () => ({
      boardRef,
      active,
      dropping,
      draggedKey,
      fingerX,
      fingerY,
      boardPageX,
      boardPageY,
      grabX,
      grabY,
      overlayX,
      overlayY,
      lift,
      layouts,
      columnOrder,
      boardScrollX,
      boardViewportWidth,
      boardContentWidth,
      rtl,
      targetKey,
      targetIndex,
      sourceKey,
      sourceIndex,
      dropBlocked,
      draggedRect,
      space,
      cardGap,
      cardInset,
      scrollEdgeX,
      scrollEdgeY,
      scrollSpeed,
      contentLeft,
      columnStep,
      columnWidth: columnWidthValue,
      colActive,
      colDropping,
      colDraggedKey,
      colSourceIndex,
      colTargetIndex,
      colGrabX,
      colGrabY,
      colOverlayX,
      colOverlayY,
      colStartY,
      colLift,
    }),
    [
      boardRef,
      active,
      dropping,
      draggedKey,
      fingerX,
      fingerY,
      boardPageX,
      boardPageY,
      grabX,
      grabY,
      overlayX,
      overlayY,
      lift,
      layouts,
      columnOrder,
      boardScrollX,
      boardViewportWidth,
      boardContentWidth,
      rtl,
      targetKey,
      targetIndex,
      sourceKey,
      sourceIndex,
      dropBlocked,
      draggedRect,
      space,
      cardGap,
      cardInset,
      scrollEdgeX,
      scrollEdgeY,
      scrollSpeed,
      contentLeft,
      columnStep,
      columnWidthValue,
      colActive,
      colDropping,
      colDraggedKey,
      colSourceIndex,
      colTargetIndex,
      colGrabX,
      colGrabY,
      colOverlayX,
      colOverlayY,
      colStartY,
      colLift,
    ]
  );

  useEffect(() => {
    columnOrder.value = board.columns.map((column) => keyOf(column.id));
  }, [board.columns, columnOrder]);

  // --- Drag state (JS thread): drives the placeholder and overlay ---
  // The drop target lives in a ref: it changes many times per drag and the
  // spacers follow it on the UI thread, so it never needs a render.
  const [drag, setDrag] = useState<ActiveDrag<TCard, TColumn> | null>(null);
  const dragRef = useRef<ActiveDrag<TCard, TColumn> | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  const dragCount = useRef(0);
  // Column drags: same pattern, the landing index lives in a ref.
  const [columnDrag, setColumnDrag] =
    useState<ActiveColumnDrag<TColumn> | null>(null);
  const columnDragRef = useRef<ActiveColumnDrag<TColumn> | null>(null);
  const columnTargetRef = useRef(0);

  // Latest props for the stable drag actions below.
  const latest = useRef({
    board,
    isControlled,
    canDropCard,
    onCardDragStart,
    onCardDragEnd,
    onColumnDragStart,
    onColumnDragEnd,
    onBoardChange: props.onBoardChange,
  });
  useLayoutEffect(() => {
    latest.current = {
      board,
      isControlled,
      canDropCard,
      onCardDragStart,
      onCardDragEnd,
      onColumnDragStart,
      onColumnDragEnd,
      onBoardChange: props.onBoardChange,
    };
  });

  // Stops the drag loops. The target is kept until the drop has rendered
  // (see the effect below) so open spacers don't collapse a frame early.
  const resetDragValues = useCallback(() => {
    active.value = false;
    dropping.value = false;
    draggedKey.value = null;
    lift.value = 0;
  }, [active, dropping, draggedKey, lift]);
  const resetColumnValues = useCallback(() => {
    colActive.value = false;
    colDropping.value = false;
    colDraggedKey.value = null;
    colLift.value = 0;
  }, [colActive, colDropping, colDraggedKey, colLift]);

  const actions = useMemo<DragActions>(
    () => ({
      start(cardKey, columnKey, index, width, height) {
        const current = latest.current.board;
        const column = current.columns.find((c) => keyOf(c.id) === columnKey);
        const card = column?.cards[index];
        if (!column || !card || keyOf(card.id) !== cardKey) {
          resetDragValues();
          return;
        }
        dragCount.current += 1;
        // Columns this card may not be dropped into, for the hit tests.
        const canDrop = latest.current.canDropCard;
        if (canDrop) {
          const blocked: Record<string, boolean> = {};
          for (const toColumn of current.columns) {
            if (!canDrop({ card, fromColumn: column, toColumn })) {
              blocked[keyOf(toColumn.id)] = true;
            }
          }
          dropBlocked.value = blocked;
        }
        dragRef.current = {
          card,
          column,
          sourceColumnKey: columnKey,
          sourceIndex: index,
          width,
          height,
        };
        targetRef.current = { columnKey, index };
        setDrag(dragRef.current);
        const event: CardDragStartEvent<TCard> = {
          card,
          source: { fromColumnId: column.id, fromPosition: index },
        };
        latest.current.onCardDragStart?.(event);
      },

      setTarget(columnKey, index) {
        if (!dragRef.current) return;
        const previous = targetRef.current;
        if (previous?.columnKey === columnKey && previous.index === index) {
          return;
        }
        targetRef.current = { columnKey, index };
      },

      finish() {
        const finished = dragRef.current;
        const dropTarget = targetRef.current;
        dragRef.current = null;
        targetRef.current = null;
        resetDragValues();
        if (!finished) return;

        const {
          board: current,
          isControlled: controlled,
          onCardDragEnd: onEnd,
          onBoardChange,
        } = latest.current;
        const source: CardSource = {
          fromColumnId: finished.column.id,
          fromPosition: finished.sourceIndex,
        };
        const targetColumn = dropTarget
          ? current.columns.find((c) => keyOf(c.id) === dropTarget.columnKey)
          : undefined;
        const destination: CardDestination =
          targetColumn && dropTarget
            ? { toColumnId: targetColumn.id, toPosition: dropTarget.index }
            : {
                toColumnId: source.fromColumnId,
                toPosition: source.fromPosition,
              };

        // State updates below are batched into a single render, so the
        // overlay disappears in the same frame the card lands in its column.
        if (!controlled) {
          const next = moveCard(current, source, destination);
          if (next !== current) {
            setInternalBoard(next);
            onBoardChange?.(next);
          }
        }
        const event: CardDragEndEvent<TCard> = {
          card: finished.card,
          source,
          destination,
          via: 'drag',
        };
        onEnd?.(event);
        setDrag(null);
      },

      startColumn(columnKey, index, width, height, cards) {
        const column = latest.current.board.columns[index];
        if (!column || keyOf(column.id) !== columnKey) {
          resetColumnValues();
          return;
        }
        dragCount.current += 1;
        columnDragRef.current = {
          column,
          key: columnKey,
          sourceIndex: index,
          width,
          height,
          cards,
        };
        columnTargetRef.current = index;
        setColumnDrag(columnDragRef.current);
        const event: ColumnDragStartEvent<TColumn> = {
          column,
          source: { fromPosition: index },
        };
        latest.current.onColumnDragStart?.(event);
      },

      setColumnTarget(index) {
        if (columnDragRef.current) columnTargetRef.current = index;
      },

      finishColumn() {
        const finished = columnDragRef.current;
        columnDragRef.current = null;
        resetColumnValues();
        if (!finished) return;

        const {
          board: current,
          isControlled: controlled,
          onColumnDragEnd: onEnd,
          onBoardChange,
        } = latest.current;
        const source: ColumnSource = { fromPosition: finished.sourceIndex };
        const destination: ColumnDestination = {
          toPosition: columnTargetRef.current,
        };
        // Batched into one render: the copy disappears in the frame the
        // column lands in its new place.
        if (!controlled) {
          const next = moveColumn(current, source, destination);
          if (next !== current) {
            setInternalBoard(next);
            onBoardChange?.(next);
          }
        }
        const event: ColumnDragEndEvent<TColumn> = {
          column: finished.column,
          source,
          destination,
          via: 'drag',
        };
        onEnd?.(event);
        setColumnDrag(null);
      },
    }),
    [resetDragValues, resetColumnValues, dropBlocked]
  );

  const activationDelay = resolveActivationDelay(dragActivationDelay);
  const dragContext = useMemo<DragContextValue>(
    () => ({
      shared,
      actions,
      enabled: !disableCardDrag,
      activationDelay,
      dragCount,
    }),
    [shared, actions, disableCardDrag, activationDelay]
  );

  // --- Every frame while dragging: auto-scroll the board near its left or
  // right edge, then re-check the drop target under the (still) finger. ---
  function scrollBoardAtEdges(
    timeSincePreviousFrame: number | null,
    draggingColumn: boolean
  ) {
    'worklet';
    const x = fingerX.value - boardPageX.value;
    const frames = (timeSincePreviousFrame ?? 16) / 16.67;
    const speed =
      autoScrollSpeed(
        x,
        0,
        boardViewportWidth.value,
        scrollEdgeX.value,
        scrollSpeed.value
      ) * frames;
    if (speed === 0) return;
    // `speed` is physical (positive: towards the right edge); the scroll is
    // kept from the start edge, which is the right one in RTL boards.
    const max = Math.max(0, boardContentWidth.value - boardViewportWidth.value);
    const next = clampScroll(
      boardScrollX.value + (rtl.value ? -speed : speed),
      boardContentWidth.value,
      boardViewportWidth.value
    );
    if (next === boardScrollX.value) return;
    boardScrollX.value = next;
    // Native scroll views take offsets from the left; RTL ones on web count
    // from the right edge, from 0 down.
    const offset = !rtl.value ? next : IS_WEB ? -next : max - next;
    scrollTo(boardScrollRef, offset, 0, false);
    if (draggingColumn) {
      updateColumnTarget(shared, actions.setColumnTarget);
    } else {
      updateDragTarget(shared, actions.setTarget);
    }
  }

  const dragFrame = useFrameCallback((frame) => {
    'worklet';
    const card = active.value && !dropping.value;
    const column = colActive.value && !colDropping.value;
    if (!card && !column) return;
    try {
      scrollBoardAtEdges(frame.timeSincePreviousFrame, column);
    } catch (error) {
      reportDragError('board auto-scroll', error);
    }
  }, false);

  const isDragging = drag !== null;
  const isColumnDragging = columnDrag !== null;
  const { setActive: setDragFrameActive } = dragFrame;
  useEffect(() => {
    setDragFrameActive(isDragging || isColumnDragging);
  }, [isDragging, isColumnDragging, setDragFrameActive]);
  useEffect(() => {
    if (!isDragging) {
      // The drop has rendered and the spacers are gone: clear the target.
      targetKey.value = null;
      sourceKey.value = null;
      draggedRect.value = null;
    }
  }, [isDragging, targetKey, sourceKey, draggedRect]);

  // --- Layout: measure the board for fullScreen width and column height ---
  const { width: windowWidth } = useWindowDimensions();
  const [boardSize, setBoardSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      boardViewportWidth.value = width;
      setBoardSize((previous) =>
        previous?.width === width && previous.height === height
          ? previous
          : { width, height }
      );
    },
    [boardViewportWidth]
  );
  const handleBoardScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      // Kept from the start edge. Native scroll views report offsets from
      // the left (in RTL that is the far end); RTL ones on web count from
      // the right edge, from 0 down.
      const x = contentOffset.x;
      boardScrollX.value = !isRTL
        ? x
        : IS_WEB
          ? -x
          : Math.max(0, contentSize.width - layoutMeasurement.width) - x;
    },
    [boardScrollX, isRTL]
  );
  const handleBoardContentSize = useCallback(
    (width: number) => {
      boardContentWidth.value = width;
    },
    [boardContentWidth]
  );

  const isFullScreen = columnWidth === 'fullScreen';
  const resolvedColumnWidth = isFullScreen
    ? Math.max(
        0,
        (boardSize?.width ?? windowWidth) - theme.spacing.boardPadding * 2
      )
    : (columnWidth ?? DEFAULT_COLUMN_WIDTH[theme.density]);
  // Where columns sit in the scroll content: positions come from these and
  // the column order, never from measurements (see findTargetColumn).
  const boardContentStyle = useMemo(
    () => StyleSheet.flatten([base.boardContent, styles?.boardContent]) ?? {},
    [base.boardContent, styles?.boardContent]
  );
  // Padding on the start edge (the right one in RTL boards).
  const boardLeft = numberOr(
    boardContentStyle.paddingStart ??
      (isRTL && !swapsLeftAndRight
        ? boardContentStyle.paddingRight
        : boardContentStyle.paddingLeft) ??
      boardContentStyle.paddingHorizontal ??
      boardContentStyle.padding,
    0
  );
  const columnGap = numberOr(
    boardContentStyle.columnGap ?? boardContentStyle.gap,
    0
  );
  const step = resolvedColumnWidth + columnGap;
  useEffect(() => {
    contentLeft.value = boardLeft;
    columnStep.value = step;
    columnWidthValue.value = resolvedColumnWidth;
  }, [
    boardLeft,
    step,
    resolvedColumnWidth,
    contentLeft,
    columnStep,
    columnWidthValue,
  ]);

  const columnMaxHeight = boardSize
    ? Math.max(0, boardSize.height - theme.spacing.boardPadding * 2)
    : undefined;

  const liftStyle = useMemo(
    () => resolveDragStyle(dragStyle),
    // Compare the numbers, not the object (often written inline).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragStyle?.scale, dragStyle?.rotation, dragStyle?.opacity]
  );
  // One custom landing spot per drag, reused by every spacer.
  const placeholder = useMemo(
    () =>
      drag && renderPlaceholder
        ? renderPlaceholder({ card: drag.card, height: drag.height, theme })
        : undefined,
    [drag, renderPlaceholder, theme]
  );

  const shouldSnap = snapToColumns ?? isFullScreen;
  const snapInterval = step;

  // While a column is dragged, every other column gets a spacer in front of
  // it (and one goes at the end) for the landing spot.
  const columnItems = useMemo(
    () =>
      buildColumnItems(
        board.columns,
        isColumnDragging,
        isColumnDragging ? columnDrag!.column.id : undefined
      ),
    [board.columns, isColumnDragging, columnDrag]
  );

  // --- Screen-reader actions: move cards and columns without dragging ---
  // Cards read the board while they render (the layout effect that updates
  // `latest` runs after them).
  const boardNow = useRef(board);
  boardNow.current = board;
  const a11yFocus = useRef<string | null>(null);
  // Cards and headers re-read their actions when columns are added, removed,
  // reordered or renamed, or the drop rules are switched on or off.
  const columnsKey = board.columns
    .map((column) => `${keyOf(column.id)}\u0001${column.title ?? ''}`)
    .join('\u0002');
  const hasDropRule = canDropCard !== undefined;
  const a11y = useMemo<KanbanA11y>(() => {
    // Whether `card` (in column `from`) may go to column `to`, by the rules
    // in effect when asked.
    const acceptsFrom =
      (
        columns: readonly TColumn[],
        card: KanbanCard,
        from: number,
        rule: BoardBaseProps<TCard, TColumn>['canDropCard']
      ) =>
      (to: number) =>
        !rule ||
        rule({
          card: card as TCard,
          fromColumn: columns[from]!,
          toColumn: columns[to]!,
        });

    return {
      enabled: !disableAccessibilityActions,
      labels,
      focusTarget: a11yFocus,

      cardActions(card, column, index) {
        const columns = boardNow.current.columns;
        const from = columns.findIndex((c) => c.id === column.id);
        if (from < 0) return [];
        const moves = cardMoves(
          columns,
          from,
          index,
          acceptsFrom(columns, card, from, latest.current.canDropCard)
        );
        const list = [];
        if (moves.up) list.push({ name: 'moveUp', label: labels.moveCardUp });
        if (moves.down) {
          list.push({ name: 'moveDown', label: labels.moveCardDown });
        }
        if (moves.previous >= 0) {
          list.push({
            name: 'moveToPreviousColumn',
            label: labels.moveCardToColumn(titleOf(columns[moves.previous]!)),
          });
        }
        if (moves.next >= 0) {
          list.push({
            name: 'moveToNextColumn',
            label: labels.moveCardToColumn(titleOf(columns[moves.next]!)),
          });
        }
        return list;
      },

      performCardAction(card, column, index, action: CardActionName) {
        const {
          board: current,
          isControlled: controlled,
          canDropCard: rule,
          onCardDragEnd: onEnd,
          onBoardChange,
        } = latest.current;
        const columns = current.columns;
        const from = columns.findIndex((c) => c.id === column.id);
        if (from < 0 || columns[from]!.cards[index]?.id !== card.id) return;
        const target = cardActionTarget(
          columns,
          from,
          index,
          action,
          acceptsFrom(columns, card, from, rule)
        );
        if (!target) return;
        const toColumn = columns[target.columnIndex]!;
        const source: CardSource = {
          fromColumnId: column.id,
          fromPosition: index,
        };
        const destination: CardDestination = {
          toColumnId: toColumn.id,
          toPosition: target.position,
        };
        if (!controlled) {
          const next = moveCard(current, source, destination);
          if (next !== current) {
            setInternalBoard(next);
            onBoardChange?.(next);
          }
        }
        a11yFocus.current = `card:${keyOf(card.id)}`;
        const event: CardDragEndEvent<TCard> = {
          card: card as TCard,
          source,
          destination,
          via: 'accessibility',
        };
        onEnd?.(event);
        const count =
          toColumn.cards.length + (target.columnIndex === from ? 0 : 1);
        announce(
          labels.cardMoved({
            card: titleOf(card),
            column: titleOf(toColumn),
            position: target.position + 1,
            count,
          })
        );
      },

      columnActions(_column, index) {
        const columns = boardNow.current.columns;
        const list = [];
        if (index > 0 && columns[index - 1]) {
          list.push({
            name: 'moveBefore',
            label: labels.moveColumnBefore(titleOf(columns[index - 1]!)),
          });
        }
        if (columns[index + 1]) {
          list.push({
            name: 'moveAfter',
            label: labels.moveColumnAfter(titleOf(columns[index + 1]!)),
          });
        }
        return list;
      },

      performColumnAction(column, index, action: ColumnActionName) {
        const {
          board: current,
          isControlled: controlled,
          onColumnDragEnd: onEnd,
          onBoardChange,
        } = latest.current;
        if (current.columns[index]?.id !== column.id) return;
        const to = columnActionTarget(current.columns.length, index, action);
        if (to === null) return;
        const source: ColumnSource = { fromPosition: index };
        const destination: ColumnDestination = { toPosition: to };
        if (!controlled) {
          const next = moveColumn(current, source, destination);
          if (next !== current) {
            setInternalBoard(next);
            onBoardChange?.(next);
          }
        }
        a11yFocus.current = `column:${keyOf(column.id)}`;
        const event: ColumnDragEndEvent<TColumn> = {
          column: column as TColumn,
          source,
          destination,
          via: 'accessibility',
        };
        onEnd?.(event);
        announce(
          labels.columnMoved({
            column: titleOf(column),
            position: to + 1,
            count: current.columns.length,
          })
        );
      },
    };
    // columnsKey and hasDropRule stand in for the board and the rules, which
    // the actions read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disableAccessibilityActions, labels, columnsKey, hasDropRule]);

  return (
    <KanbanThemeProvider value={theme}>
      <A11yProvider value={a11y}>
        <DragProvider value={dragContext}>
          <GestureHandlerRootView
            testID={testID}
            // The drag math follows this direction, so it is set here. On
            // web, `dir` also makes start/end styles follow it.
            style={[base.boardRoot, style, { direction }]}
            {...(IS_WEB ? ({ dir: direction } as object) : null)}
          >
            <Animated.View
              ref={boardRef}
              testID={`${testID}-viewport`}
              style={base.boardViewport}
              onLayout={handleLayout}
              collapsable={false}
            >
              <ScrollView
                ref={boardScrollRef}
                horizontal
                style={base.boardScroll}
                contentContainerStyle={[
                  base.boardContent,
                  styles?.boardContent,
                ]}
                showsHorizontalScrollIndicator={false}
                scrollEnabled={!isDragging && !isColumnDragging}
                scrollEventThrottle={16}
                onScroll={handleBoardScroll}
                onContentSizeChange={handleBoardContentSize}
                testID={`${testID}-scroll`}
                snapToInterval={shouldSnap ? snapInterval : undefined}
                snapToAlignment="start"
                decelerationRate={shouldSnap ? 'fast' : 'normal'}
                disableIntervalMomentum={shouldSnap}
              >
                {columnItems.map((item) => {
                  if (item.type !== 'card') {
                    const isEnd = item.type === 'end';
                    return (
                      <ColumnSpacer
                        key={isEnd ? 'column-spacer:end' : item.key}
                        slot={item.slot}
                        initiallyOpen={item.slot === columnDrag!.sourceIndex}
                        step={step}
                        boxWidth={resolvedColumnWidth}
                        boxHeight={columnDrag!.height}
                        gap={columnGap}
                        end={isEnd}
                        base={base}
                        styles={styles}
                      />
                    );
                  }
                  const { card: column, index, hidden: lifted } = item;
                  const columnKey = keyOf(column.id);
                  const isSource = drag?.sourceColumnKey === columnKey;
                  return (
                    <Column
                      key={columnKey}
                      column={column}
                      index={index}
                      width={resolvedColumnWidth}
                      maxHeight={columnMaxHeight}
                      fill={columnHeight === 'fill'}
                      theme={theme}
                      base={base}
                      styles={styles}
                      labels={labels}
                      showCardCount={showCardCount}
                      renderCard={renderCard}
                      renderColumnHeader={renderColumnHeader}
                      renderColumnFooter={renderColumnFooter}
                      renderEmptyColumn={renderEmptyColumn}
                      onCardPress={onCardPress}
                      canDragCard={canDragCard}
                      placeholder={placeholder}
                      isDragging={isDragging}
                      draggedHeight={drag?.height ?? 0}
                      hiddenCardId={isSource ? drag!.card.id : undefined}
                      sourceSlot={isSource ? drag!.sourceIndex : undefined}
                      columnDraggable={
                        !disableColumnDrag && (canDragColumn?.(column) ?? true)
                      }
                      lifted={lifted}
                      liftedLeft={boardLeft + index * step}
                      virtualize={virtualize}
                      estimatedCardHeight={estimatedCardHeight}
                    />
                  );
                })}
              </ScrollView>

              {drag ? (
                <DragOverlay
                  card={drag.card}
                  column={drag.column}
                  index={drag.sourceIndex}
                  width={drag.width}
                  theme={theme}
                  base={base}
                  styles={styles}
                  renderCard={renderDragPreview ?? renderCard}
                  customPreview={renderDragPreview !== undefined}
                  lift={liftStyle}
                  rtl={isRTL}
                />
              ) : null}

              {columnDrag ? (
                <ColumnDragOverlay
                  column={columnDrag.column}
                  index={columnDrag.sourceIndex}
                  width={columnDrag.width}
                  height={columnDrag.height}
                  cards={columnDrag.cards}
                  theme={theme}
                  base={base}
                  styles={styles}
                  labels={labels}
                  showCardCount={showCardCount}
                  renderCard={renderCard}
                  renderColumnHeader={renderColumnHeader}
                  renderColumnFooter={renderColumnFooter}
                  renderEmptyColumn={renderEmptyColumn}
                  lift={liftStyle}
                  rtl={isRTL}
                />
              ) : null}
            </Animated.View>
          </GestureHandlerRootView>
        </DragProvider>
      </A11yProvider>
    </KanbanThemeProvider>
  );
}

const IS_WEB = Platform.OS === 'web';

const numberOr = (value: unknown, fallback: number) =>
  typeof value === 'number' ? value : fallback;

interface DragOverlayProps<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
> {
  card: TCard;
  column: TColumn;
  index: number;
  width: number;
  theme: KanbanTheme;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
  renderCard: BoardBaseProps<TCard, TColumn>['renderCard'];
  /** `renderDragPreview` draws it: no default lifted shadow. */
  customPreview: boolean;
  lift: ResolvedDragStyle;
  rtl: boolean;
}

/** The lifted card that follows the finger, drawn above every column. */
function DragOverlay<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>({
  card,
  column,
  index,
  width,
  theme,
  base,
  styles,
  renderCard,
  customPreview,
  lift: liftStyle,
  rtl: rtlLayout,
}: DragOverlayProps<TCard, TColumn>) {
  const { shared } = useDragContext();
  const { overlayX, overlayY, lift } = shared;
  const { scale, rotation, opacity } = liftStyle;
  const animatedStyle = useAnimatedStyle(
    () => ({
      opacity: 1 + (opacity - 1) * lift.value,
      transform: [
        { translateX: overlayX.value },
        { translateY: overlayY.value },
        { scale: 1 + (scale - 1) * lift.value },
        { rotate: `${rotation * lift.value}deg` },
      ],
    }),
    [scale, rotation, opacity]
  );

  return (
    <Animated.View
      testID="kanban-drag-overlay"
      // Drag visuals only: screen readers skip them.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        base.dragOverlay,
        leftEdge(rtlLayout),
        !customPreview && base.dragShadow,
        { width },
        styles?.dragOverlay,
        animatedStyle,
      ]}
    >
      {renderCard ? (
        renderCard(card, { column, index, theme })
      ) : (
        <DefaultCard card={card} base={base} styles={styles} />
      )}
    </Animated.View>
  );
}
