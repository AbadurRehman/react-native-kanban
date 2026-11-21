import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  measure,
  runOnJS,
  useAnimatedRef,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { DROP_MS, LONG_PRESS_MS } from '../dnd/constants';
import { useDragContext } from '../dnd/DragContext';
import { reportDragError } from '../dnd/debug';
import { dropPosition, moveOverlay, updateDragTarget } from '../dnd/engine';
import { keyOf } from '../dnd/geometry';
import { removeCardLayout, setCardLayout } from '../dnd/registry';
import type { KanbanTheme } from '../theme/types';
import type { KanbanCard, KanbanColumn } from '../types';
import type { KanbanBaseStyles } from './createBaseStyles';
import type { BoardBaseProps, CardRenderInfo, KanbanStyles } from './types';

interface DefaultCardProps {
  card: KanbanCard;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
}

/** The built-in card: title plus optional description. */
export function DefaultCard({ card, base, styles }: DefaultCardProps) {
  return (
    <View style={[base.card, styles?.card]}>
      <Text style={[base.cardTitle, styles?.cardTitle]} numberOfLines={3}>
        {card.title ?? String(card.id)}
      </Text>
      {card.description ? (
        <Text
          style={[base.cardDescription, styles?.cardDescription]}
          numberOfLines={4}
        >
          {card.description}
        </Text>
      ) : null}
    </View>
  );
}

interface CardItemProps<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
> {
  card: TCard;
  column: TColumn;
  index: number;
  /**
   * This card is being dragged: it stays mounted (so its gesture keeps
   * running) but leaves the layout and turns invisible.
   */
  hidden: boolean;
  theme: KanbanTheme;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
  renderCard: BoardBaseProps<TCard, TColumn>['renderCard'];
  onCardPress: BoardBaseProps<TCard, TColumn>['onCardPress'];
}

function CardItemImpl<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>({
  card,
  column,
  index,
  hidden,
  theme,
  base,
  styles,
  renderCard,
  onCardPress,
}: CardItemProps<TCard, TColumn>) {
  const { shared, actions, enabled, dragCount } = useDragContext();
  const cardRef = useAnimatedRef<Animated.View>();
  const cardKey = keyOf(card.id);
  const columnKey = keyOf(column.id);

  // Report this card's rect so drag hit tests can find drop positions.
  const { layouts, active } = shared;
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      setCardLayout(layouts, active, columnKey, cardKey, {
        x,
        y,
        width,
        height,
      });
    },
    [layouts, active, columnKey, cardKey]
  );
  useEffect(
    () => () => removeCardLayout(layouts, active, columnKey, cardKey),
    [layouts, active, columnKey, cardKey]
  );

  const pan = useMemo(() => {
    const s = shared;
    return Gesture.Pan()
      .withTestId(`kanban-card-drag-${String(card.id)}`)
      .enabled(enabled)
      .activateAfterLongPress(LONG_PRESS_MS)
      .onStart((event) => {
        'worklet';
        try {
          if (s.active.value) return; // one drag at a time
          const cardBox = measure(cardRef);
          const boardBox = measure(s.boardRef);
          if (!cardBox || !boardBox) return;

          s.boardPageX.value = boardBox.pageX;
          s.boardPageY.value = boardBox.pageY;
          s.fingerX.value = event.absoluteX;
          s.fingerY.value = event.absoluteY;
          s.grabX.value = event.absoluteX - cardBox.pageX;
          s.grabY.value = event.absoluteY - cardBox.pageY;
          s.overlayX.value = cardBox.pageX - boardBox.pageX;
          s.overlayY.value = cardBox.pageY - boardBox.pageY;
          s.draggedKey.value = cardKey;
          s.sourceKey.value = columnKey;
          s.draggedRect.value = s.layouts.value[columnKey]?.cards[cardKey] ?? {
            x: s.cardInset.value,
            y: 0,
            width: cardBox.width,
            height: cardBox.height,
          };
          s.space.value = cardBox.height + s.cardGap.value;
          s.targetKey.value = columnKey;
          s.targetIndex.value = index;
          s.dropping.value = false;
          s.debugUpdates.value = 0;
          s.debugFrames.value = 0;
          s.debugMapper.value = 0;
          s.debugError.value = null;
          s.debugTouches.value = 0;
          s.debugRaf.value = 0;
          s.debugEnd.value = '';
          s.debugStart.value = Date.now();
          s.active.value = true;
          s.lift.value = withSpring(1, { damping: 18, stiffness: 260 });
          runOnJS(actions.start)(
            cardKey,
            columnKey,
            index,
            cardBox.width,
            cardBox.height
          );
        } catch (error) {
          reportDragError(s, 'drag start', error);
        }
      })
      .onUpdate((event) => {
        'worklet';
        if (s.draggedKey.value !== cardKey || s.dropping.value) return;
        try {
          s.debugUpdates.value += 1;
          s.fingerX.value = event.absoluteX;
          s.fingerY.value = event.absoluteY;
          moveOverlay(s);
          updateDragTarget(s, actions.setTarget);
        } catch (error) {
          reportDragError(s, 'drag update', error);
        }
      })
      .onTouchesMove(() => {
        'worklet';
        if (s.draggedKey.value === cardKey) s.debugTouches.value += 1;
      })
      .onFinalize((_event, success) => {
        'worklet';
        if (s.draggedKey.value === cardKey && s.debugEnd.value === '') {
          s.debugEnd.value = `${Date.now() - s.debugStart.value}ms ${
            success ? 'ended' : 'cancelled'
          }${s.dropping.value ? ' (already dropping)' : ''}`;
        }
        if (!s.active.value || s.dropping.value) return;
        if (s.draggedKey.value !== cardKey) return;
        s.dropping.value = true;

        // Glide into the landing spot, then commit the move on the JS thread.
        try {
          const landing = dropPosition(s);
          s.lift.value = withTiming(0, { duration: DROP_MS });
          if (landing) {
            s.overlayX.value = withTiming(landing.x, { duration: DROP_MS });
            s.overlayY.value = withTiming(
              landing.y,
              { duration: DROP_MS },
              () => {
                runOnJS(actions.finish)();
              }
            );
          } else {
            runOnJS(actions.finish)();
          }
        } catch (error) {
          reportDragError(s, 'drop', error);
          runOnJS(actions.finish)(); // never leave a drag hanging
        }
      });
  }, [shared, actions, enabled, cardRef, card.id, cardKey, columnKey, index]);

  // Releasing a drag also ends the press: ignore presses that turned into a
  // drag. Presses without a press-in (screen reader activation) always count.
  const dragCountAtPressIn = useRef(-1);
  const handlePressIn = useCallback(() => {
    dragCountAtPressIn.current = dragCount.current;
  }, [dragCount]);
  const handlePressOut = useCallback(() => {
    // onPress (if any) fires right after onPressOut; clear afterwards.
    setTimeout(() => {
      dragCountAtPressIn.current = -1;
    }, 0);
  }, []);
  const handlePress = useCallback(() => {
    const turnedIntoDrag =
      dragCountAtPressIn.current !== -1 &&
      dragCount.current !== dragCountAtPressIn.current;
    if (turnedIntoDrag) return;
    onCardPress?.(card, { column, index, theme });
  }, [dragCount, onCardPress, card, column, index, theme]);

  const info: CardRenderInfo<TColumn> = { column, index, theme };
  const content = renderCard ? (
    renderCard(card, info)
  ) : (
    <DefaultCard card={card} base={base} styles={styles} />
  );

  // The outer view is measured (its parent is always the column's scroll
  // content; a GestureDetector may add its own wrapper, e.g. on web) and is
  // the one hidden while dragging. The inner view owns the gesture and stays
  // mounted throughout the drag.
  return (
    <View
      testID={`kanban-card-${card.id}`}
      onLayout={handleLayout}
      pointerEvents={hidden ? 'none' : 'auto'}
      style={hidden ? cardStyles.hidden : undefined}
    >
      <GestureDetector gesture={pan}>
        <Animated.View ref={cardRef} collapsable={false}>
          {onCardPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={card.title ?? String(card.id)}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={handlePress}
              style={({ pressed }) => (pressed ? base.pressed : undefined)}
            >
              {content}
            </Pressable>
          ) : (
            content
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const CardItem = memo(CardItemImpl) as typeof CardItemImpl;

const cardStyles = StyleSheet.create({
  // Out of the layout flow (absolute children don't take part in `gap`) and
  // invisible, but still mounted.
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
});
