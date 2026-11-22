import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useDragContext } from '../dnd/DragContext';
import { keyOf } from '../dnd/geometry';
import type { ResolvedDragStyle } from '../dnd/options';
import type { KanbanTheme } from '../theme/types';
import type { KanbanCard, KanbanColumn } from '../types';
import { DefaultCard } from './Card';
import { ColumnHeader } from './Column';
import type { KanbanBaseStyles } from './createBaseStyles';
import type {
  BoardBaseProps,
  ColumnRenderInfo,
  KanbanLabels,
  KanbanStyles,
} from './types';

/** The cards in view when the column lifted (see `visibleRange`). */
export interface VisibleCardRange {
  first: number;
  last: number;
  /** Where the first one starts, relative to the card viewport's top. */
  offset: number;
}

interface ColumnDragOverlayProps<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
> {
  column: TColumn;
  index: number;
  width: number;
  height: number;
  cards: VisibleCardRange;
  theme: KanbanTheme;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
  labels: KanbanLabels;
  showCardCount: boolean;
  renderCard: BoardBaseProps<TCard, TColumn>['renderCard'];
  renderColumnHeader: BoardBaseProps<TCard, TColumn>['renderColumnHeader'];
  renderColumnFooter: BoardBaseProps<TCard, TColumn>['renderColumnFooter'];
  renderEmptyColumn: BoardBaseProps<TCard, TColumn>['renderEmptyColumn'];
  lift: ResolvedDragStyle;
}

/**
 * The lifted column that follows the finger: a still copy of the column as it
 * looked at lift (header, the cards in view, footer), drawn above the board.
 * Only the visible cards are rendered, so long columns stay cheap to lift.
 */
export function ColumnDragOverlay<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>({
  column,
  index,
  width,
  height,
  cards,
  theme,
  base,
  styles,
  labels,
  showCardCount,
  renderCard,
  renderColumnHeader,
  renderColumnFooter,
  renderEmptyColumn,
  lift: liftStyle,
}: ColumnDragOverlayProps<TCard, TColumn>) {
  const { shared } = useDragContext();
  const { colOverlayX, colOverlayY, colLift } = shared;
  const { scale, rotation, opacity } = liftStyle;
  const animatedStyle = useAnimatedStyle(
    () => ({
      opacity: 1 + (opacity - 1) * colLift.value,
      transform: [
        { translateX: colOverlayX.value },
        { translateY: colOverlayY.value },
        { scale: 1 + (scale - 1) * colLift.value },
        { rotate: `${rotation * colLift.value}deg` },
      ],
    }),
    [scale, rotation, opacity]
  );

  const info: ColumnRenderInfo = {
    index,
    cardCount: column.cards.length,
    theme,
  };
  const inView =
    cards.first < 0 ? [] : column.cards.slice(cards.first, cards.last + 1);

  return (
    <Animated.View
      testID="kanban-column-drag-overlay"
      pointerEvents="none"
      style={[
        overlayStyles.overlay,
        base.column,
        base.columnDragShadow,
        styles?.column,
        { width, height },
        styles?.columnDragOverlay,
        animatedStyle,
      ]}
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

      <View style={overlayStyles.viewport}>
        {column.cards.length === 0 ? (
          <View style={[base.columnContent, styles?.columnContent]}>
            {renderEmptyColumn?.(column, info) ?? (
              <View style={[base.emptyColumn, styles?.emptyColumn]}>
                <Text style={[base.emptyColumnText, styles?.emptyColumnText]}>
                  {labels.emptyColumn}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View
            style={[
              base.columnContent,
              styles?.columnContent,
              // `offset` already includes the content's top padding.
              overlayStyles.noTopPadding,
              { marginTop: cards.offset },
            ]}
          >
            {inView.map((card, i) => (
              <View key={keyOf(card.id)}>
                {renderCard ? (
                  renderCard(card, {
                    column,
                    index: cards.first + i,
                    theme,
                  })
                ) : (
                  <DefaultCard card={card} base={base} styles={styles} />
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {renderColumnFooter ? (
        <View style={[base.columnFooter, styles?.columnFooter]}>
          {renderColumnFooter(column, info)}
        </View>
      ) : null}
    </Animated.View>
  );
}

const overlayStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1000,
  },
  noTopPadding: { paddingTop: 0 },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
});
