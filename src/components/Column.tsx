import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  measure,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useKanbanA11y } from '../a11y/A11yContext';
import { FOCUS_DELAY_MS, focusElement } from '../a11y/announce';
import { titleOf, type ColumnActionName } from '../a11y/moves';
import { DROP_MS, LAYOUT_MS } from '../dnd/constants';
import { useDragContext } from '../dnd/DragContext';
import { reportDragError } from '../dnd/debug';
import {
  columnDropPosition,
  moveColumnOverlay,
  updateColumnTarget,
  updateDragTarget,
} from '../dnd/engine';
import {
  autoScrollSpeed,
  buildColumnItems,
  cardWindow,
  clampScroll,
  keyOf,
  visibleCards,
  visibleRange,
} from '../dnd/geometry';
import { patchColumnLayout, removeColumnLayout } from '../dnd/registry';
import type { KanbanTheme } from '../theme/types';
import type { KanbanCard, KanbanColumn, KanbanId } from '../types';
import { CardItem } from './Card';
import type { KanbanBaseStyles } from './createBaseStyles';
import { Spacer } from './Spacer';
import type {
  BoardBaseProps,
  ColumnRenderInfo,
  KanbanLabels,
  KanbanStyles,
} from './types';

interface ColumnProps<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
> {
  column: TColumn;
  index: number;
  width: number;
  /** Tallest the column can be in 'content' mode (board height minus padding). */
  maxHeight: number | undefined;
  fill: boolean;
  theme: KanbanTheme;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
  labels: KanbanLabels;
  showCardCount: boolean;
  renderCard: BoardBaseProps<TCard, TColumn>['renderCard'];
  renderColumnHeader: BoardBaseProps<TCard, TColumn>['renderColumnHeader'];
  renderColumnFooter: BoardBaseProps<TCard, TColumn>['renderColumnFooter'];
  renderEmptyColumn: BoardBaseProps<TCard, TColumn>['renderEmptyColumn'];
  onCardPress: BoardBaseProps<TCard, TColumn>['onCardPress'];
  canDragCard: BoardBaseProps<TCard, TColumn>['canDragCard'];
  /** Custom landing spot (`renderPlaceholder`) for the current drag. */
  placeholder: ReactNode;

  /** Any card on the board is being dragged (locks scrolling, adds spacers). */
  isDragging: boolean;
  /** Height of the dragged card, for the landing spot. */
  draggedHeight: number;
  /** The dragged card, when it comes from this column. */
  hiddenCardId: KanbanId | undefined;
  /** Slot the dragged card left, open at lift (source column only). */
  sourceSlot: number | undefined;

  /** The header can lift this column (`disableColumnDrag`, `canDragColumn`). */
  columnDraggable: boolean;
  /**
   * This column is being dragged: it stays mounted (its header gesture keeps
   * running) but leaves the layout, at `liftedLeft`, and turns invisible.
   */
  lifted: boolean;
  liftedLeft: number;

  /** Render only the cards near the viewport (`virtualize`). */
  virtualize: boolean;
  /** Height assumed for cards not measured yet (`estimatedCardHeight`). */
  estimatedCardHeight: number | undefined;
}

/** Assumed height of a card before any card in the column was measured. */
const DEFAULT_CARD_HEIGHT = 72;

interface ColumnHeaderProps {
  column: KanbanColumn;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
  showCardCount: boolean;
}

/** The built-in column header: title plus card count. */
export function ColumnHeader({
  column,
  base,
  styles,
  showCardCount,
}: ColumnHeaderProps) {
  return (
    <View style={[base.columnHeader, styles?.columnHeader]}>
      <Text
        style={[base.columnTitle, styles?.columnTitle]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {column.title ?? String(column.id)}
      </Text>
      {showCardCount ? (
        <View style={[base.countBadge, styles?.countBadge]}>
          <Text
            style={[base.countBadgeText, styles?.countBadgeText]}
            testID={`kanban-column-count-${column.id}`}
          >
            {column.cards.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ColumnImpl<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>({
  column,
  index,
  width,
  maxHeight,
  fill,
  theme,
  base,
  styles,
  labels,
  showCardCount,
  renderCard,
  renderColumnHeader,
  renderColumnFooter,
  renderEmptyColumn,
  onCardPress,
  canDragCard,
  placeholder,
  isDragging,
  draggedHeight,
  hiddenCardId,
  sourceSlot,
  columnDraggable,
  lifted,
  liftedLeft,
  virtualize,
  estimatedCardHeight,
}: ColumnProps<TCard, TColumn>) {
  const { shared, actions, activationDelay } = useDragContext();
  const { layouts } = shared;
  const columnKey = keyOf(column.id);
  const scrollRef = useAnimatedRef<any>();

  // Report where this column and its card viewport are, for hit testing.
  const columnTop = useRef(0);
  const columnHeight = useRef(0);
  const viewportOffset = useRef(0);
  const viewportHeight = useRef(0);
  const scrollY = useRef(0);
  // Set below, once the window logic exists; called from the handlers here.
  const updateWindowRef = useRef<(force: boolean) => void>(() => {});
  // Everything reported so far, replayed when the registry effect re-runs.
  const lastLayout = useRef<Parameters<typeof patchColumnLayout>[2]>({});
  const patchLayout = useCallback(
    (patch: Parameters<typeof patchColumnLayout>[2]) => {
      lastLayout.current = { ...lastLayout.current, ...patch };
      patchColumnLayout(layouts, columnKey, patch);
    },
    [layouts, columnKey]
  );
  const handleColumnLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width: measuredWidth, height } = event.nativeEvent.layout;
      columnTop.current = y;
      columnHeight.current = height;
      patchLayout({
        x,
        width: measuredWidth,
        viewportTop: y + viewportOffset.current,
      });
    },
    [patchLayout]
  );
  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      viewportOffset.current = y;
      const resized = viewportHeight.current !== height;
      viewportHeight.current = height;
      patchLayout({
        viewportTop: columnTop.current + y,
        viewportHeight: height,
      });
      // The first window was sized for a whole screen: fit it now.
      updateWindowRef.current(resized);
    },
    [patchLayout]
  );
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      patchLayout({ contentHeight: height });
    },
    [patchLayout]
  );
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = event.nativeEvent.contentOffset.y;
      patchLayout({ scrollY: scrollY.current });
      updateWindowRef.current(false);
    },
    [patchLayout]
  );
  // Re-register when the effect re-runs (Fast Refresh, StrictMode): the
  // cleanup removed this column and onLayout won't fire again for it.
  useEffect(() => {
    patchColumnLayout(layouts, columnKey, { ...lastLayout.current });
    return () => removeColumnLayout(layouts, columnKey);
  }, [layouts, columnKey]);
  // Card order for hit testing (positions are stacked from it).
  const cardOrder = useMemo(
    () => column.cards.map((card) => keyOf(card.id)),
    [column.cards]
  );
  useEffect(() => {
    patchLayout({ order: cardOrder });
  }, [patchLayout, cardOrder]);
  // Where the first card starts inside the scroll content (custom top padding).
  const contentTop = useMemo(() => {
    const content =
      StyleSheet.flatten([base.columnContent, styles?.columnContent]) ?? {};
    const top =
      content.paddingTop ?? content.paddingVertical ?? content.padding;
    return typeof top === 'number' ? top : 0;
  }, [base.columnContent, styles?.columnContent]);
  useEffect(() => {
    patchLayout({ contentTop });
  }, [patchLayout, contentTop]);

  // --- Windowing: only the cards near the viewport are rendered. The ones
  // above and below are replaced by empty space of their (measured or
  // estimated) height, so the scroll content keeps its full size. ---
  const cardGap = theme.spacing.cardGap;
  const { height: screenHeight } = useWindowDimensions();
  const heights = useRef(new Map<string, number>());
  const hiddenKey = hiddenCardId !== undefined ? keyOf(hiddenCardId) : null;
  const estimateHeight = useCallback(() => {
    if (estimatedCardHeight !== undefined && estimatedCardHeight > 0) {
      return estimatedCardHeight;
    }
    if (heights.current.size === 0) return DEFAULT_CARD_HEIGHT;
    let total = 0;
    heights.current.forEach((height) => {
      total += height;
    });
    return total / heights.current.size;
  }, [estimatedCardHeight]);
  const flowHeights = useCallback(() => {
    const estimate = estimateHeight();
    return cardOrder.map((key) =>
      key === hiddenKey ? null : (heights.current.get(key) ?? estimate)
    );
  }, [cardOrder, hiddenKey, estimateHeight]);
  // Render a screen ahead above and below; re-window once half of that is
  // used up, so scrolling re-renders the column only now and then.
  const computeWindow = useCallback(
    (overscanScreens: number) => {
      // Until the board is measured a column can be as tall as its content:
      // never window more than a screen.
      const viewport = Math.min(
        viewportHeight.current || screenHeight,
        screenHeight
      );
      return cardWindow(
        flowHeights(),
        cardGap,
        contentTop,
        scrollY.current,
        viewport,
        viewport * overscanScreens
      );
    },
    [flowHeights, cardGap, contentTop, screenHeight]
  );
  const allCards = useMemo(
    () => ({ first: 0, last: column.cards.length - 1 }),
    [column.cards.length]
  );
  const [range, setRange] = useState(() => {
    const { first, last } = computeWindow(1);
    return { first, last };
  });
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const estimateSent = useRef(-1);
  const updateWindow = useCallback(
    (force: boolean) => {
      const estimate = estimateHeight();
      if (estimate !== estimateSent.current) {
        estimateSent.current = estimate;
        patchLayout({ estimate });
      }
      if (!virtualize) return;
      const current = rangeRef.current;
      const needed = computeWindow(0.5);
      const covered =
        needed.first >= current.first && needed.last <= current.last;
      if (covered && !force) return;
      const { first, last } = computeWindow(1);
      if (first !== current.first || last !== current.last) {
        rangeRef.current = { first, last };
        setRange(rangeRef.current);
      }
    },
    [virtualize, computeWindow, estimateHeight, patchLayout]
  );
  updateWindowRef.current = updateWindow;
  // Re-window when the cards, the dragged card or the spacing change.
  useLayoutEffect(() => {
    updateWindow(true);
  }, [updateWindow]);
  // New measurements can let more cards fit: check once per frame at most.
  const windowCheck = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (windowCheck.current !== null) {
        cancelAnimationFrame(windowCheck.current);
      }
    },
    []
  );
  const handleCardHeight = useCallback((cardKey: string, height: number) => {
    if (heights.current.get(cardKey) === height) return;
    heights.current.set(cardKey, height);
    if (windowCheck.current !== null) return;
    windowCheck.current = requestAnimationFrame(() => {
      windowCheck.current = null;
      updateWindowRef.current(false);
    });
  }, []);
  // Forget cards that left the column.
  useEffect(() => {
    const keys = new Set(cardOrder);
    heights.current.forEach((_height, key) => {
      if (!keys.has(key)) heights.current.delete(key);
    });
  }, [cardOrder]);

  // Auto-scroll this column while a card hovers near its top or bottom edge.
  function scrollColumnAtEdges(timeSincePreviousFrame: number | null) {
    'worklet';
    const s = shared;
    if (!s.active.value || s.dropping.value) return;
    if (s.targetKey.value !== columnKey) return;
    const layout = s.layouts.value[columnKey];
    if (!layout) return;
    const fingerY = s.fingerY.value - s.boardPageY.value;
    const frames = (timeSincePreviousFrame ?? 16) / 16.67;
    const speed =
      autoScrollSpeed(
        fingerY,
        layout.viewportTop,
        layout.viewportTop + layout.viewportHeight,
        s.scrollEdgeY.value,
        s.scrollSpeed.value
      ) * frames;
    if (speed === 0) return;
    const next = clampScroll(
      layout.scrollY + speed,
      layout.contentHeight,
      layout.viewportHeight
    );
    if (next === layout.scrollY) return;
    s.layouts.modify((all) => {
      'worklet';
      const current = all[columnKey];
      if (current) current.scrollY = next;
      return all;
    });
    scrollTo(scrollRef, 0, next, false);
    updateDragTarget(s, actions.setTarget);
  }

  const autoScroll = useFrameCallback((frame) => {
    'worklet';
    try {
      scrollColumnAtEdges(frame.timeSincePreviousFrame);
    } catch (error) {
      reportDragError('column auto-scroll', error);
    }
  }, false);

  const { setActive } = autoScroll;
  useEffect(() => {
    setActive(isDragging);
  }, [isDragging, setActive]);

  // Long-press the header to lift the whole column.
  const columnRef = useAnimatedRef<Animated.View>();
  const headerPan = useMemo(() => {
    const s = shared;
    const gesture = Gesture.Pan()
      .withTestId(`kanban-column-drag-${String(column.id)}`)
      .enabled(columnDraggable);
    const activated =
      activationDelay > 0
        ? gesture.activateAfterLongPress(activationDelay)
        : gesture.minDistance(4);
    return activated
      .onStart((event) => {
        'worklet';
        try {
          if (s.active.value || s.colActive.value) return; // one drag at a time
          const columnBox = measure(columnRef);
          const boardBox = measure(s.boardRef);
          if (!columnBox || !boardBox) return;

          s.boardPageX.value = boardBox.pageX;
          s.boardPageY.value = boardBox.pageY;
          s.fingerX.value = event.absoluteX;
          s.fingerY.value = event.absoluteY;
          s.colGrabX.value = event.absoluteX - columnBox.pageX;
          s.colGrabY.value = event.absoluteY - columnBox.pageY;
          s.colOverlayX.value = columnBox.pageX - boardBox.pageX;
          s.colOverlayY.value = columnBox.pageY - boardBox.pageY;
          s.colStartY.value = s.colOverlayY.value;
          s.colDraggedKey.value = columnKey;
          s.colSourceIndex.value = index;
          s.colTargetIndex.value = index;
          s.colDropping.value = false;
          s.colActive.value = true;
          s.colLift.value = withSpring(1, { damping: 18, stiffness: 260 });

          // The cards in view, for the floating copy.
          const layout = s.layouts.value[columnKey];
          const inView = layout
            ? visibleRange(
                visibleCards(layout, null, s.cardGap.value, s.cardInset.value),
                layout.scrollY,
                layout.viewportHeight
              )
            : { first: -1, last: -1, offset: 0 };
          runOnJS(actions.startColumn)(
            columnKey,
            index,
            columnBox.width,
            columnBox.height,
            inView
          );
        } catch (error) {
          reportDragError('column drag start', error);
        }
      })
      .onUpdate((event) => {
        'worklet';
        if (s.colDraggedKey.value !== columnKey || s.colDropping.value) return;
        try {
          s.fingerX.value = event.absoluteX;
          s.fingerY.value = event.absoluteY;
          moveColumnOverlay(s);
          updateColumnTarget(s, actions.setColumnTarget);
        } catch (error) {
          reportDragError('column drag update', error);
        }
      })
      .onFinalize(() => {
        'worklet';
        if (!s.colActive.value || s.colDropping.value) return;
        if (s.colDraggedKey.value !== columnKey) return;
        s.colDropping.value = true;

        // Glide into the landing spot, then commit the move on the JS thread.
        try {
          const landing = columnDropPosition(s);
          s.colLift.value = withTiming(0, { duration: DROP_MS });
          s.colOverlayX.value = withTiming(landing.x, { duration: DROP_MS });
          s.colOverlayY.value = withTiming(
            landing.y,
            { duration: DROP_MS },
            () => {
              runOnJS(actions.finishColumn)();
            }
          );
        } catch (error) {
          reportDragError('column drop', error);
          runOnJS(actions.finishColumn)(); // never leave a drag hanging
        }
      });
  }, [
    shared,
    actions,
    activationDelay,
    columnDraggable,
    columnRef,
    column.id,
    columnKey,
    index,
  ]);

  // A card just moved here with a screen-reader action takes focus once it
  // renders: include it even if it landed outside the window.
  const a11y = useKanbanA11y();
  const { focusTarget } = a11y;
  const focusIndex = focusTarget.current?.startsWith('card:')
    ? cardOrder.indexOf(focusTarget.current.slice('card:'.length))
    : -1;
  let shown = virtualize ? range : allCards;
  if (virtualize && focusIndex >= 0) {
    if (focusIndex < shown.first || focusIndex > shown.last) {
      shown = {
        first: Math.min(shown.first, focusIndex),
        last: Math.max(shown.last, focusIndex),
      };
    }
  }
  // Keep it rendered after the focus request is used up.
  useLayoutEffect(() => {
    if (virtualize && shown !== range) {
      rangeRef.current = shown;
      setRange(shown);
    }
  }, [virtualize, shown, range]);
  const items = useMemo(
    () => buildColumnItems(column.cards, isDragging, hiddenCardId, shown),
    [column.cards, isDragging, hiddenCardId, shown]
  );
  // Space for the cards above and below the window.
  let spaceAbove = 0;
  let spaceBelow = 0;
  if (virtualize) {
    const flow = flowHeights();
    for (let i = 0; i < flow.length; i++) {
      const height = flow[i];
      if (height === null || height === undefined) continue;
      if (i < shown.first) spaceAbove += height + cardGap;
      else if (i > shown.last) spaceBelow += height + cardGap;
    }
  }

  // An empty column is itself the drop zone: report it and light it up when
  // a dragged card hovers over this column.
  const handleEmptyLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width: w, height } = event.nativeEvent.layout;
      patchLayout({
        empty: { x, y, width: w, height },
      });
    },
    [patchLayout]
  );
  const isEmpty = column.cards.length === 0;
  useEffect(() => {
    if (!isEmpty) patchLayout({ empty: null });
  }, [isEmpty, patchLayout]);
  const { active, targetKey } = shared;
  const dropZoneStyle = useAnimatedStyle(() => ({
    opacity: withTiming(active.value && targetKey.value === columnKey ? 1 : 0, {
      duration: LAYOUT_MS,
    }),
  }));
  const gap = cardGap;

  const info: ColumnRenderInfo = {
    index,
    cardCount: column.cards.length,
    theme,
  };

  // Screen readers: the header is one heading ("To do, 5 cards") with Move
  // before / after actions; focus follows it after such a move.
  const headerGrouped = a11y.enabled && !lifted;
  const handleHeaderAction = useCallback(
    (event: AccessibilityActionEvent) => {
      a11y.performColumnAction(
        column,
        index,
        event.nativeEvent.actionName as ColumnActionName
      );
    },
    [a11y, column, index]
  );
  const headerRef = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (focusTarget.current !== `column:${columnKey}`) return;
    focusTarget.current = null;
    const timer = setTimeout(
      () => focusElement(headerRef.current),
      FOCUS_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [focusTarget, columnKey, index]);

  // While lifted, the column keeps its place and size out of the layout flow
  // and only its content fades: iOS cancels a gesture whose view stops
  // accepting touches (opacity 0, pointerEvents none).
  const hide = lifted ? columnStyles.invisible : undefined;
  return (
    <Animated.View
      ref={columnRef}
      collapsable={false}
      testID={`kanban-column-${column.id}`}
      onLayout={handleColumnLayout}
      style={[
        base.column,
        fill ? null : [base.columnContentHeight, { maxHeight }],
        { width },
        styles?.column,
        lifted
          ? [
              columnStyles.lifted,
              {
                start: liftedLeft, // from the start edge, in either direction
                top: columnTop.current,
                height: columnHeight.current,
              },
            ]
          : null,
      ]}
    >
      <GestureDetector gesture={headerPan}>
        <Animated.View
          testID={`kanban-column-header-${column.id}`}
          collapsable={false}
        >
          <View
            ref={headerRef}
            testID={`kanban-column-heading-${column.id}`}
            style={hide}
            accessibilityElementsHidden={lifted}
            importantForAccessibility={lifted ? 'no-hide-descendants' : 'auto'}
            accessible={headerGrouped || undefined}
            accessibilityRole={headerGrouped ? 'header' : undefined}
            accessibilityLabel={
              headerGrouped && !renderColumnHeader
                ? `${titleOf(column)}, ${a11y.labels.cardCount(column.cards.length)}`
                : undefined
            }
            accessibilityActions={
              headerGrouped && columnDraggable
                ? a11y.columnActions(column, index)
                : undefined
            }
            onAccessibilityAction={
              headerGrouped && columnDraggable ? handleHeaderAction : undefined
            }
          >
            {renderColumnHeader ? (
              renderColumnHeader(column, info)
            ) : (
              <ColumnHeader
                column={column}
                base={base}
                styles={styles}
                showCardCount={showCardCount}
              />
            )}
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Measured wrapper: the ScrollView may sit inside a gesture wrapper
          (e.g. on web), which would skew its own onLayout coordinates. */}
      <View
        testID={`kanban-column-viewport-${column.id}`}
        style={[fill ? base.columnScrollFill : base.columnScroll, hide]}
        onLayout={handleViewportLayout}
        accessibilityElementsHidden={lifted}
        importantForAccessibility={lifted ? 'no-hide-descendants' : 'auto'}
      >
        <ScrollView
          ref={scrollRef}
          testID={`kanban-column-scroll-${column.id}`}
          style={fill ? base.columnScrollFill : base.columnScroll}
          contentContainerStyle={[base.columnContent, styles?.columnContent]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isDragging}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
        >
          {isEmpty ? (
            <View onLayout={handleEmptyLayout} testID="kanban-empty-column">
              {renderEmptyColumn?.(column, info) ?? (
                <View style={[base.emptyColumn, styles?.emptyColumn]}>
                  <Text style={[base.emptyColumnText, styles?.emptyColumnText]}>
                    {labels.emptyColumn}
                  </Text>
                </View>
              )}
              {isDragging ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    base.placeholder,
                    styles?.placeholder,
                    dropZoneStyle,
                  ]}
                />
              ) : null}
            </View>
          ) : (
            <>
              {spaceAbove > 0 ? (
                // The column's gap follows it: leave one out.
                <View
                  testID="kanban-cards-above"
                  style={{ height: spaceAbove - gap }}
                />
              ) : null}
              {items.map((item) => {
                if (item.type === 'card') {
                  return (
                    <CardItem
                      key={keyOf(item.card.id)}
                      card={item.card}
                      column={column}
                      index={item.index}
                      hidden={item.hidden}
                      draggable={canDragCard?.(item.card, column) ?? true}
                      theme={theme}
                      base={base}
                      styles={styles}
                      renderCard={renderCard}
                      onCardPress={onCardPress}
                      onHeight={handleCardHeight}
                    />
                  );
                }
                const isEnd = item.type === 'end';
                return (
                  <Spacer
                    key={isEnd ? 'spacer:end' : item.key}
                    columnKey={columnKey}
                    slot={item.slot}
                    initiallyOpen={item.slot === sourceSlot}
                    boxHeight={draggedHeight}
                    gap={gap}
                    end={isEnd}
                    base={base}
                    styles={styles}
                  >
                    {placeholder}
                  </Spacer>
                );
              })}
              {spaceBelow > 0 ? (
                <View
                  testID="kanban-cards-below"
                  style={{ height: spaceBelow - gap }}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </View>

      {renderColumnFooter ? (
        <View
          style={[base.columnFooter, styles?.columnFooter, hide]}
          accessibilityElementsHidden={lifted}
          importantForAccessibility={lifted ? 'no-hide-descendants' : 'auto'}
        >
          {renderColumnFooter(column, info)}
        </View>
      ) : null}
    </Animated.View>
  );
}

export const Column = memo(ColumnImpl) as typeof ColumnImpl;

const columnStyles = StyleSheet.create({
  // Out of the layout flow (absolute children don't take part in `gap`), with
  // no background or shadow left behind; `left`/`top` keep it where it was.
  lifted: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  invisible: { opacity: 0 },
});
