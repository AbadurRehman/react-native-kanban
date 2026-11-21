import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  KanbanThemeProvider,
  useResolvedKanbanTheme,
} from '../theme/ThemeContext';
import type { KanbanCard, KanbanColumn } from '../types';
import { Column } from './Column';
import { createBaseStyles } from './createBaseStyles';
import type { BoardProps, KanbanLabels } from './types';

const DEFAULT_COLUMN_WIDTH = { comfortable: 280, compact: 240 } as const;

const DEFAULT_LABELS: KanbanLabels = {
  emptyColumn: 'No cards',
};

/**
 * A horizontally scrolling Kanban board.
 *
 * @example
 * <Board
 *   board={board}
 *   theme="auto"
 *   onCardPress={(card) => openCard(card.id)}
 * />
 */
export function Board<
  TCard extends KanbanCard = KanbanCard,
  TColumn extends KanbanColumn<TCard> = KanbanColumn<TCard>,
>({
  board,
  theme: themeProp,
  density,
  columnWidth,
  snapToColumns,
  showCardCount = true,
  styles,
  labels: labelsProp,
  renderCard,
  renderColumnHeader,
  renderColumnFooter,
  renderEmptyColumn,
  onCardPress,
  style,
  testID = 'kanban-board',
}: BoardProps<TCard, TColumn>) {
  const theme = useResolvedKanbanTheme(themeProp, density);
  const base = useMemo(() => createBaseStyles(theme), [theme]);

  const emptyColumnLabel = labelsProp?.emptyColumn;
  const labels = useMemo<KanbanLabels>(
    () => ({
      ...DEFAULT_LABELS,
      ...(emptyColumnLabel !== undefined && { emptyColumn: emptyColumnLabel }),
    }),
    [emptyColumnLabel]
  );

  // Measure the board so 'fullScreen' columns fit it exactly, even when the
  // board doesn't span the whole window (tablets, split view, modals).
  const { width: windowWidth } = useWindowDimensions();
  const [boardWidth, setBoardWidth] = useState<number | null>(null);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setBoardWidth((previous) => (previous === width ? previous : width));
  }, []);

  const isFullScreen = columnWidth === 'fullScreen';
  const resolvedColumnWidth = isFullScreen
    ? Math.max(0, (boardWidth ?? windowWidth) - theme.spacing.boardPadding * 2)
    : (columnWidth ?? DEFAULT_COLUMN_WIDTH[theme.density]);

  const shouldSnap = snapToColumns ?? isFullScreen;
  const snapInterval = resolvedColumnWidth + theme.spacing.columnGap;

  return (
    <KanbanThemeProvider value={theme}>
      <View testID={testID} style={[base.board, style]} onLayout={handleLayout}>
        <ScrollView
          horizontal
          style={base.boardScroll}
          contentContainerStyle={[base.boardContent, styles?.boardContent]}
          showsHorizontalScrollIndicator={false}
          snapToInterval={shouldSnap ? snapInterval : undefined}
          snapToAlignment="start"
          decelerationRate={shouldSnap ? 'fast' : 'normal'}
          disableIntervalMomentum={shouldSnap}
        >
          {board.columns.map((column, index) => (
            <Column
              key={column.id}
              column={column}
              index={index}
              width={resolvedColumnWidth}
              theme={theme}
              base={base}
              styles={styles}
              labels={labels}
              showCardCount={showCardCount}
              renderCard={renderCard}
              renderColumnHeader={renderColumnHeader}
              renderColumnFooter={renderColumnFooter}
              renderEmptyColumn={renderEmptyColumn}
              onCardPress={onCardPress}
            />
          ))}
        </ScrollView>
      </View>
    </KanbanThemeProvider>
  );
}
