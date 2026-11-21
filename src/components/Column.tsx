import { memo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { KanbanTheme } from '../theme/types';
import type { KanbanCard, KanbanColumn } from '../types';
import { CardItem } from './Card';
import type { KanbanBaseStyles } from './createBaseStyles';
import type {
  BoardProps,
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
  renderCard: BoardProps<TCard, TColumn>['renderCard'];
  renderColumnHeader: BoardProps<TCard, TColumn>['renderColumnHeader'];
  renderColumnFooter: BoardProps<TCard, TColumn>['renderColumnFooter'];
  renderEmptyColumn: BoardProps<TCard, TColumn>['renderEmptyColumn'];
  onCardPress: BoardProps<TCard, TColumn>['onCardPress'];
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
}: ColumnProps<TCard, TColumn>) {
  const info: ColumnRenderInfo = {
    index,
    cardCount: column.cards.length,
    theme,
  };

  return (
    <View
      testID={`kanban-column-${column.id}`}
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

      <ScrollView
        style={fill ? base.columnScrollFill : base.columnScroll}
        contentContainerStyle={[base.columnContent, styles?.columnContent]}
        showsVerticalScrollIndicator={false}
      >
        {column.cards.length === 0
          ? (renderEmptyColumn?.(column, info) ?? (
              <View style={[base.emptyColumn, styles?.emptyColumn]}>
                <Text style={[base.emptyColumnText, styles?.emptyColumnText]}>
                  {labels.emptyColumn}
                </Text>
              </View>
            ))
          : column.cards.map((card, cardIndex) => (
              <CardItem
                key={card.id}
                card={card}
                column={column}
                index={cardIndex}
                theme={theme}
                base={base}
                styles={styles}
                renderCard={renderCard}
                onCardPress={onCardPress}
              />
            ))}
      </ScrollView>

      {renderColumnFooter ? (
        <View style={[base.columnFooter, styles?.columnFooter]}>
          {renderColumnFooter(column, info)}
        </View>
      ) : null}
    </View>
  );
}

export const Column = memo(ColumnImpl) as typeof ColumnImpl;
