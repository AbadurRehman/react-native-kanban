import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  withTiming,
} from 'react-native-reanimated';
import { EDGE_Y, LAYOUT_MS, MAX_SCROLL_SPEED } from '../dnd/constants';
import { useDragContext } from '../dnd/DragContext';
import { reportDragError } from '../dnd/debug';
import { updateDragTarget } from '../dnd/engine';
import {
  autoScrollSpeed,
  buildColumnItems,
  clampScroll,
  keyOf,
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

  /** Any card on the board is being dragged (locks scrolling, adds spacers). */
  isDragging: boolean;
  /** Height of the dragged card, for the landing spot. */
  draggedHeight: number;
  /** The dragged card, when it comes from this column. */
  hiddenCardId: KanbanId | undefined;
  /** Slot the dragged card left, open at lift (source column only). */
  sourceSlot: number | undefined;
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
  isDragging,
  draggedHeight,
  hiddenCardId,
  sourceSlot,
}: ColumnProps<TCard, TColumn>) {
  const { shared, actions } = useDragContext();
  const { layouts } = shared;
  const columnKey = keyOf(column.id);
  const scrollRef = useAnimatedRef<any>();

  // Report where this column and its card viewport are, for hit testing.
  const columnTop = useRef(0);
  const viewportOffset = useRef(0);
  const handleColumnLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width: measuredWidth } = event.nativeEvent.layout;
      columnTop.current = y;
      patchColumnLayout(layouts, columnKey, {
        x,
        width: measuredWidth,
        viewportTop: y + viewportOffset.current,
      });
    },
    [layouts, columnKey]
  );
  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      viewportOffset.current = y;
      patchColumnLayout(layouts, columnKey, {
        viewportTop: columnTop.current + y,
        viewportHeight: height,
      });
    },
    [layouts, columnKey]
  );
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      patchColumnLayout(layouts, columnKey, { contentHeight: height });
    },
    [layouts, columnKey]
  );
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      patchColumnLayout(layouts, columnKey, {
        scrollY: event.nativeEvent.contentOffset.y,
      });
    },
    [layouts, columnKey]
  );
  useEffect(
    () => () => removeColumnLayout(layouts, columnKey),
    [layouts, columnKey]
  );
  // Card order for hit testing (positions are stacked from it).
  const cardOrder = useMemo(
    () => column.cards.map((card) => keyOf(card.id)),
    [column.cards]
  );
  useEffect(() => {
    patchColumnLayout(layouts, columnKey, { order: cardOrder });
  }, [layouts, columnKey, cardOrder]);
  // Where the first card starts inside the scroll content (custom top padding).
  const contentTop = useMemo(() => {
    const content =
      StyleSheet.flatten([base.columnContent, styles?.columnContent]) ?? {};
    const top =
      content.paddingTop ?? content.paddingVertical ?? content.padding;
    return typeof top === 'number' ? top : 0;
  }, [base.columnContent, styles?.columnContent]);
  useEffect(() => {
    patchColumnLayout(layouts, columnKey, { contentTop });
  }, [layouts, columnKey, contentTop]);

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
        EDGE_Y,
        MAX_SCROLL_SPEED
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
      reportDragError(shared, 'column auto-scroll', error);
    }
  }, false);

  const { setActive } = autoScroll;
  useEffect(() => {
    setActive(isDragging);
  }, [isDragging, setActive]);

  const items = useMemo(
    () => buildColumnItems(column.cards, isDragging, hiddenCardId),
    [column.cards, isDragging, hiddenCardId]
  );

  // An empty column is itself the drop zone: report it and light it up when
  // a dragged card hovers over this column.
  const handleEmptyLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width: w, height } = event.nativeEvent.layout;
      patchColumnLayout(layouts, columnKey, {
        empty: { x, y, width: w, height },
      });
    },
    [layouts, columnKey]
  );
  const isEmpty = column.cards.length === 0;
  useEffect(() => {
    if (!isEmpty) patchColumnLayout(layouts, columnKey, { empty: null });
  }, [isEmpty, layouts, columnKey]);
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

  return (
    <View
      testID={`kanban-column-${column.id}`}
      onLayout={handleColumnLayout}
      style={[
        base.column,
        fill ? null : [base.columnContentHeight, { maxHeight }],
        { width },
        styles?.column,
      ]}
    >
      {renderColumnHeader ? (
        renderColumnHeader(column, info)
      ) : (
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
      )}

      {/* Measured wrapper: the ScrollView may sit inside a gesture wrapper
          (e.g. on web), which would skew its own onLayout coordinates. */}
      <View
        testID={`kanban-column-viewport-${column.id}`}
        style={fill ? base.columnScrollFill : base.columnScroll}
        onLayout={handleViewportLayout}
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
                />
              );
            })
          )}
        </ScrollView>
      </View>

      {renderColumnFooter ? (
        <View style={[base.columnFooter, styles?.columnFooter]}>
          {renderColumnFooter(column, info)}
        </View>
      ) : null}
    </View>
  );
}

export const Column = memo(ColumnImpl) as typeof ColumnImpl;
