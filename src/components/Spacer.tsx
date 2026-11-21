import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LAYOUT_MS } from '../dnd/constants';
import { reportDragError } from '../dnd/debug';
import { useDragContext } from '../dnd/DragContext';
import type { KanbanBaseStyles } from './createBaseStyles';
import type { KanbanStyles } from './types';

interface SpacerProps {
  columnKey: string;
  /** Visible-card index this spacer opens for (insert position). */
  slot: number;
  /** Open on mount: the dragged card's own slot at lift. */
  initiallyOpen: boolean;
  /** Height of the dragged card (the landing box). */
  boxHeight: number;
  gap: number;
  /** The spacer after the last card (sits below it rather than above). */
  end?: boolean;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
}

/**
 * A landing spot that opens while the dragged card hovers over its slot,
 * pushing the cards below it down. Mounted only during a drag. Its height is
 * animated on the UI thread, so moving the placeholder never re-renders.
 *
 * Negative margins cancel the column's card gap while closed, so adding the
 * spacers at lift doesn't move anything.
 */
export function Spacer({
  columnKey,
  slot,
  initiallyOpen,
  boxHeight,
  gap,
  end = false,
  base,
  styles,
}: SpacerProps) {
  const { shared } = useDragContext();
  const { targetKey, targetIndex, space } = shared;
  const height = useSharedValue(initiallyOpen ? boxHeight + gap : 0);

  useAnimatedReaction(
    () => targetKey.value === columnKey && targetIndex.value === slot,
    (isOpen, wasOpen) => {
      try {
        const next = isOpen ? space.value : 0;
        if (wasOpen === null) {
          height.value = next; // first run: no animation
        } else if (isOpen !== wasOpen) {
          height.value = withTiming(next, { duration: LAYOUT_MS });
        }
      } catch (error) {
        reportDragError(shared, 'landing spot', error);
      }
    }
  );

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      testID={end ? 'kanban-spacer-end' : 'kanban-spacer'}
      pointerEvents="none"
      style={[
        spacerStyles.clip,
        end ? { marginTop: -gap } : { marginBottom: -gap },
        animatedStyle,
      ]}
    >
      <View
        style={[
          base.placeholder,
          { height: boxHeight },
          end ? { marginTop: gap } : null,
          styles?.placeholder,
        ]}
      />
    </Animated.View>
  );
}

const spacerStyles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
