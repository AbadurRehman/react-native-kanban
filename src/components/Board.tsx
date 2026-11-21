import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
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
import { updateDragTarget } from '../dnd/engine';
import {
  resolveActivationDelay,
  resolveAutoScroll,
  resolveDragStyle,
  type ResolvedDragStyle,
} from '../dnd/options';
import {
  autoScrollSpeed,
  clampScroll,
  keyOf,
  type ColumnLayout,
  type Rect,
} from '../dnd/geometry';
import { moveCard } from '../helpers';
import {
  KanbanThemeProvider,
  useResolvedKanbanTheme,
} from '../theme/ThemeContext';
import type { KanbanTheme } from '../theme/types';
import type {
  CardDestination,
  CardSource,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
} from '../types';
import { DefaultCard } from './Card';
import { Column } from './Column';
import { createBaseStyles, type KanbanBaseStyles } from './createBaseStyles';
import type {
  BoardBaseProps,
  BoardProps,
  CardDragEndEvent,
  CardDragStartEvent,
  KanbanLabels,
  KanbanStyles,
} from './types';

const DEFAULT_COLUMN_WIDTH = { comfortable: 280, compact: 240 } as const;

const DEFAULT_LABELS: KanbanLabels = {
  emptyColumn: 'No cards',
};

const EMPTY_BOARD = { columns: [] };

interface ActiveDrag<TCard, TColumn> {
  card: TCard;
  column: TColumn;
  sourceColumnKey: string;
  sourceIndex: number;
  width: number;
  height: number;
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
  const emptyColumnLabel = labelsProp?.emptyColumn;
  const labels = useMemo<KanbanLabels>(
    () => ({
      ...DEFAULT_LABELS,
      ...(emptyColumnLabel !== undefined && { emptyColumn: emptyColumnLabel }),
    }),
    [emptyColumnLabel]
  );

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
  const targetKey = useSharedValue<string | null>(null);
  const targetIndex = useSharedValue(0);
  const sourceKey = useSharedValue<string | null>(null);
  const sourceIndex = useSharedValue(0);
  const dropBlocked = useSharedValue<Record<string, boolean>>({});
  const draggedRect = useSharedValue<Rect | null>(null);
  const space = useSharedValue(0);
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

  // Latest props for the stable drag actions below.
  const latest = useRef({
    board,
    isControlled,
    canDropCard,
    onCardDragStart,
    onCardDragEnd,
    onBoardChange: props.onBoardChange,
  });
  useLayoutEffect(() => {
    latest.current = {
      board,
      isControlled,
      canDropCard,
      onCardDragStart,
      onCardDragEnd,
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
        };
        onEnd?.(event);
        setDrag(null);
      },
    }),
    [resetDragValues, dropBlocked]
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
  function scrollBoardAtEdges(timeSincePreviousFrame: number | null) {
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
    const next = clampScroll(
      boardScrollX.value + speed,
      boardContentWidth.value,
      boardViewportWidth.value
    );
    if (next === boardScrollX.value) return;
    boardScrollX.value = next;
    scrollTo(boardScrollRef, next, 0, false);
    updateDragTarget(shared, actions.setTarget);
  }

  const dragFrame = useFrameCallback((frame) => {
    'worklet';
    if (!active.value || dropping.value) return;
    try {
      scrollBoardAtEdges(frame.timeSincePreviousFrame);
    } catch (error) {
      reportDragError('board auto-scroll', error);
    }
  }, false);

  const isDragging = drag !== null;
  const { setActive: setDragFrameActive } = dragFrame;
  useEffect(() => {
    setDragFrameActive(isDragging);
    if (!isDragging) {
      // The drop has rendered and the spacers are gone: clear the target.
      targetKey.value = null;
      sourceKey.value = null;
      draggedRect.value = null;
    }
  }, [isDragging, setDragFrameActive, targetKey, sourceKey, draggedRect]);

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
      boardScrollX.value = event.nativeEvent.contentOffset.x;
    },
    [boardScrollX]
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
  const snapInterval = resolvedColumnWidth + theme.spacing.columnGap;

  return (
    <KanbanThemeProvider value={theme}>
      <DragProvider value={dragContext}>
        <GestureHandlerRootView testID={testID} style={[base.boardRoot, style]}>
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
              contentContainerStyle={[base.boardContent, styles?.boardContent]}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={!isDragging}
              scrollEventThrottle={16}
              onScroll={handleBoardScroll}
              onContentSizeChange={handleBoardContentSize}
              snapToInterval={shouldSnap ? snapInterval : undefined}
              snapToAlignment="start"
              decelerationRate={shouldSnap ? 'fast' : 'normal'}
              disableIntervalMomentum={shouldSnap}
            >
              {board.columns.map((column, index) => {
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
              />
            ) : null}
          </Animated.View>
        </GestureHandlerRootView>
      </DragProvider>
    </KanbanThemeProvider>
  );
}

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
      pointerEvents="none"
      style={[
        base.dragOverlay,
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
