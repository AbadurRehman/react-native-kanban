import { memo, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { KanbanTheme } from '../theme/types';
import type { KanbanCard, KanbanColumn } from '../types';
import type { KanbanBaseStyles } from './createBaseStyles';
import type { BoardProps, CardRenderInfo, KanbanStyles } from './types';

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
  theme: KanbanTheme;
  base: KanbanBaseStyles;
  styles: KanbanStyles | undefined;
  renderCard: BoardProps<TCard, TColumn>['renderCard'];
  onCardPress: BoardProps<TCard, TColumn>['onCardPress'];
}

function CardItemImpl<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>({
  card,
  column,
  index,
  theme,
  base,
  styles,
  renderCard,
  onCardPress,
}: CardItemProps<TCard, TColumn>) {
  const info: CardRenderInfo<TColumn> = { column, index, theme };
  const content = renderCard ? (
    renderCard(card, info)
  ) : (
    <DefaultCard card={card} base={base} styles={styles} />
  );

  const handlePress = useCallback(
    () => onCardPress?.(card, { column, index, theme }),
    [onCardPress, card, column, index, theme]
  );

  if (!onCardPress) {
    return <View testID={`kanban-card-${card.id}`}>{content}</View>;
  }

  return (
    <Pressable
      testID={`kanban-card-${card.id}`}
      accessibilityRole="button"
      accessibilityLabel={card.title ?? String(card.id)}
      onPress={handlePress}
      style={({ pressed }) => (pressed ? base.pressed : undefined)}
    >
      {content}
    </Pressable>
  );
}

export const CardItem = memo(CardItemImpl) as typeof CardItemImpl;
