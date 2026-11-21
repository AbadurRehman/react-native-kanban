import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
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
}

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
}: ColumnProps<TCard, TColumn>) {
  const { shared, actions, activationDelay } = useDragContext();
  const { layouts } = shared;
  const columnKey = keyOf(column.id);
  const scrollRef = useAnimatedRef<any>();

  // Report where this column and its card viewport are, for hit testing.
  const columnTop = useRef(0);
  const columnHeight = useRef(0);
  const viewportOffset = useRef(0);
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
      patchLayout({
        viewportTop: columnTop.current + y,
        viewportHeight: height,
      });
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
      patchLayout({
        scrollY: event.nativeEvent.contentOffset.y,
      });
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
          const range = layout
            ? visibleRange(
                visibleCards(layout, null, s.cardGap.value),
                layout.scrollY,
                layout.viewportHeight
              )
            : { first: -1, last: -1, offset: 0 };
          runOnJS(actions.startColumn)(
            columnKey,
            index,
            columnBox.width,
            columnBox.height,
            range
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

  const items = useMemo(
    () => buildColumnItems(column.cards, isDragging, hiddenCardId),
    [column.cards, isDragging, hiddenCardId]
  );

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
  const gap = theme.spacing.cardGap;

  const info: ColumnRenderInfo = {
    index,
    cardCount: column.cards.length,
    theme,
  };

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
                left: liftedLeft,
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
            style={hide}
            accessibilityElementsHidden={lifted}
            importantForAccessibility={lifted ? 'no-hide-descendants' : 'auto'}
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
            items.map((item) => {
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
            })
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
