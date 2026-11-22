import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentRef,
} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
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
import { useKanbanA11y } from '../a11y/A11yContext';
import { FOCUS_DELAY_MS, focusElement } from '../a11y/announce';
import { titleOf, type CardActionName } from '../a11y/moves';
import { DROP_MS } from '../dnd/constants';
import { useDragContext } from '../dnd/DragContext';
import { reportDragError } from '../dnd/debug';
import { dropPosition, moveOverlay, updateDragTarget } from '../dnd/engine';
import { keyOf, type Rect } from '../dnd/geometry';
import { setCardLayout } from '../dnd/registry';
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
  /** `canDragCard` allows this card to be dragged. */
  draggable: boolean;
  theme: KanbanTheme;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
  renderCard: BoardBaseProps<TCard, TColumn>['renderCard'];
  onCardPress: BoardBaseProps<TCard, TColumn>['onCardPress'];
  /** Reports the card's measured height (the column windows its cards). */
  onHeight?: (cardKey: string, height: number) => void;
}

function CardItemImpl<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>({
  card,
  column,
  index,
  hidden,
  draggable,
  theme,
  base,
  styles,
  renderCard,
  onCardPress,
  onHeight,
}: CardItemProps<TCard, TColumn>) {
  const { shared, actions, enabled, activationDelay, dragCount } =
    useDragContext();
  const cardRef = useAnimatedRef<Animated.View>();
  const cardKey = keyOf(card.id);
  const columnKey = keyOf(column.id);

  // Report this card's rect so drag hit tests can find drop positions.
  const { layouts, active } = shared;
  const lastRect = useRef<Rect | null>(null);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      lastRect.current = { x, y, width, height };
      setCardLayout(layouts, active, columnKey, cardKey, lastRect.current);
      onHeight?.(cardKey, height);
    },
    [layouts, active, columnKey, cardKey, onHeight]
  );
  // Re-register when the effect re-runs (Fast Refresh, StrictMode, a new
  // registry): onLayout won't fire again for an unchanged card. Sizes stay
  // registered after unmount; the column forgets cards that leave it.
  useEffect(() => {
    if (lastRect.current) {
      setCardLayout(layouts, active, columnKey, cardKey, lastRect.current);
    }
  }, [layouts, active, columnKey, cardKey]);

  const pan = useMemo(() => {
    const s = shared;
    const gesture = Gesture.Pan()
      .withTestId(`kanban-card-drag-${String(card.id)}`)
      .enabled(enabled && draggable);
    // A long press lifts the card; with no delay, the first movement does
    // (the gesture then wins over the column's scroll).
    const activated =
      activationDelay > 0
        ? gesture.activateAfterLongPress(activationDelay)
        : gesture.minDistance(4);
    return activated
      .onStart((event) => {
        'worklet';
        try {
          if (s.active.value || s.colActive.value) return; // one drag at a time
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
          s.sourceIndex.value = index;
          s.dropBlocked.value = {};
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
          reportDragError('drag start', error);
        }
      })
      .onUpdate((event) => {
        'worklet';
        if (s.draggedKey.value !== cardKey || s.dropping.value) return;
        try {
          s.fingerX.value = event.absoluteX;
          s.fingerY.value = event.absoluteY;
          moveOverlay(s);
          updateDragTarget(s, actions.setTarget);
        } catch (error) {
          reportDragError('drag update', error);
        }
      })
      .onFinalize(() => {
        'worklet';
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
          reportDragError('drop', error);
          runOnJS(actions.finish)(); // never leave a drag hanging
        }
      });
  }, [
    shared,
    actions,
    enabled,
    draggable,
    activationDelay,
    cardRef,
    card.id,
    cardKey,
    columnKey,
    index,
  ]);

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

  // Screen readers: the card is one element (its text read together, then
  // its place in the column) with Move actions, unless turned off. Web has
  // no such actions: there the press target stays its own focusable button.
  const a11y = useKanbanA11y();
  const grouped = a11y.enabled && !hidden && Platform.OS !== 'web';
  const movable = enabled && draggable;
  const positionText = a11y.labels.cardPosition({
    position: index + 1,
    count: column.cards.length,
    column: titleOf(column),
  });
  // Android turns accessibilityValue into the whole content description, so
  // TalkBack would skip the card's text: read the position as a last child.
  const positionAsChild = Platform.OS === 'android';
  const positionChild = positionAsChild ? (
    <Text style={cardStyles.srOnly}>{positionText}</Text>
  ) : null;
  const a11yActions = grouped
    ? [
        ...(onCardPress ? [{ name: 'activate' }] : []),
        ...(movable ? a11y.cardActions(card, column, index) : []),
      ]
    : undefined;
  const handleA11yAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const name = event.nativeEvent.actionName;
      if (name === 'activate') handlePress();
      else a11y.performCardAction(card, column, index, name as CardActionName);
    },
    [a11y, card, column, index, handlePress]
  );
  const groupProps = {
    accessible: true,
    accessibilityValue: positionAsChild ? undefined : { text: positionText },
    accessibilityActions: a11yActions,
    onAccessibilityAction: handleA11yAction,
  };

  // After a move made with an action, focus follows the card.
  const contentRef = useRef<ComponentRef<typeof View>>(null);
  const pressRef = useRef<ComponentRef<typeof View>>(null);
  // A pressable card is grouped on its Pressable: on Android a clickable
  // child is left out of its parent's label, so the text would go unread.
  const groupOnPress = grouped && !!onCardPress;
  const { focusTarget } = a11y;
  useEffect(() => {
    if (focusTarget.current !== `card:${cardKey}`) return;
    focusTarget.current = null;
    const timer = setTimeout(
      () => focusElement((groupOnPress ? pressRef : contentRef).current),
      FOCUS_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [focusTarget, cardKey, index, column.id, groupOnPress]);

  const info: CardRenderInfo<TColumn> = { column, index, theme };
  const content = renderCard ? (
    renderCard(card, info)
  ) : (
    <DefaultCard card={card} base={base} styles={styles} />
  );

  // The outer view is measured (its parent is always the column's scroll
  // content; a GestureDetector may add its own wrapper, e.g. on web) and
  // leaves the layout while its card is dragged; the inner view owns the
  // gesture. Both must stay hit-testable during the drag: iOS cancels a
  // gesture whose view stops accepting touches (opacity 0, pointerEvents
  // none), so only the content fades out.
  return (
    <View
      testID={`kanban-card-${card.id}`}
      onLayout={handleLayout}
      style={
        hidden
          ? [cardStyles.lifted, { top: lastRect.current?.y ?? 0 }]
          : undefined
      }
    >
      <GestureDetector gesture={pan}>
        <Animated.View ref={cardRef} collapsable={false}>
          <View
            ref={contentRef}
            testID={`kanban-content-${card.id}`}
            style={hidden ? cardStyles.invisible : undefined}
            accessibilityElementsHidden={hidden}
            importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
            {...(grouped && !groupOnPress ? groupProps : null)}
          >
            {onCardPress ? (
              <Pressable
                ref={pressRef}
                testID={`kanban-press-${card.id}`}
                accessibilityRole="button"
                accessibilityLabel={grouped ? undefined : titleOf(card)}
                {...(groupOnPress ? groupProps : null)}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={handlePress}
                style={({ pressed }) => (pressed ? base.pressed : undefined)}
              >
                {content}
                {groupOnPress ? positionChild : null}
              </Pressable>
            ) : (
              content
            )}
            {grouped && !groupOnPress ? positionChild : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const CardItem = memo(CardItemImpl) as typeof CardItemImpl;

const cardStyles = StyleSheet.create({
  // Out of the layout flow (absolute children don't take part in `gap`);
  // `top` keeps it where it was.
  lifted: { position: 'absolute', left: 0, right: 0 },
  invisible: { opacity: 0 },
  // Read by screen readers, not shown (1pt so TalkBack counts it as visible).
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
});
