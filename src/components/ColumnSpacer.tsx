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

interface ColumnSpacerProps {
  /** Index among the other columns this spacer opens for. */
  slot: number;
  /** Open on mount: the dragged column's own slot at lift. */
  initiallyOpen: boolean;
  /** Room a column takes: its width plus the gap between columns. */
  step: number;
  /** The landing box: the dragged column's size. */
  boxWidth: number;
  boxHeight: number;
  gap: number;
  /** The spacer after the last column (sits right of it). */
  end?: boolean;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
}

/**
 * Where a dragged column will land. Opens while the column hovers over its
 * slot, pushing the columns after it right. Mounted only during a column
 * drag; its width is animated on the UI thread.
 *
 * Negative margins cancel the board's column gap while closed, so adding the
 * spacers at lift doesn't move anything.
 */
export function ColumnSpacer({
  slot,
  initiallyOpen,
  step,
  boxWidth,
  boxHeight,
  gap,
  end = false,
  base,
  styles,
}: ColumnSpacerProps) {
  const { shared } = useDragContext();
  const { colTargetIndex } = shared;
  const width = useSharedValue(initiallyOpen ? step : 0);

  useAnimatedReaction(
    () => colTargetIndex.value === slot,
    (isOpen, wasOpen) => {
      try {
        const next = isOpen ? step : 0;
        if (wasOpen === null) {
          width.value = next; // first run: no animation
        } else if (isOpen !== wasOpen) {
          width.value = withTiming(next, { duration: LAYOUT_MS });
        }
      } catch (error) {
        reportDragError('column landing spot', error);
      }
    },
    [slot, step]
  );

  const animatedStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      testID={end ? 'kanban-column-spacer-end' : 'kanban-column-spacer'}
      pointerEvents="none"
      style={[
        spacerStyles.clip,
        end ? { marginLeft: -gap } : { marginRight: -gap },
        animatedStyle,
      ]}
    >
      <View
        testID="kanban-column-placeholder"
        style={[
          base.columnPlaceholder,
          { width: boxWidth, height: boxHeight },
          end ? { marginLeft: gap } : null,
          styles?.columnPlaceholder,
        ]}
      />
    </Animated.View>
  );
}

const spacerStyles = StyleSheet.create({
  clip: { overflow: 'hidden', alignSelf: 'flex-start' },
});
