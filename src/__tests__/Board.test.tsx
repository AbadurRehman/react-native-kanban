import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import {
  Board,
  darkTheme,
  lightTheme,
  useKanbanTheme,
  type KanbanBoard,
  type KanbanCard,
} from '../index';

interface Task extends KanbanCard {
  priority: 'low' | 'high';
}

const board: KanbanBoard<Task> = {
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [
        { id: 1, title: 'Write docs', description: 'README', priority: 'low' },
        { id: 2, title: 'Ship it', priority: 'high' },
      ],
    },
    { id: 'done', title: 'Done', cards: [] },
  ],
};

const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style);

const layoutBoard = async (width: number) =>
  fireEvent(screen.getByTestId('kanban-board'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 800 } },
  });

describe('<Board />', () => {
  it('renders columns, cards, descriptions and counts', async () => {
    await render(<Board board={board} />);
    expect(screen.getByText('To do')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Write docs')).toBeTruthy();
    expect(screen.getByText('README')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-count-todo').props.children).toBe(
      2
    );
    expect(screen.getByTestId('kanban-column-count-done').props.children).toBe(
      0
    );
  });

  it('shows an empty-column placeholder with a translatable label', async () => {
    const { rerender } = await render(<Board board={board} />);
    expect(screen.getByText('No cards')).toBeTruthy();
    await rerender(
      <Board board={board} labels={{ emptyColumn: 'Nothing here' }} />
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('can hide card counts', async () => {
    await render(<Board board={board} showCardCount={false} />);
    expect(screen.queryByTestId('kanban-column-count-todo')).toBeNull();
  });

  it('uses render props with typed card info', async () => {
    const renderCard = jest.fn(
      (card: Task, info: { index: number; column: { id: unknown } }) => (
        <Text>{`${card.priority}:${card.title}@${String(info.column.id)}#${info.index}`}</Text>
      )
    );
    await render(
      <Board
        board={board}
        renderCard={renderCard}
        renderColumnHeader={(column, info) => (
          <Text>{`${column.title} (${info.cardCount})`}</Text>
        )}
        renderColumnFooter={(column) => <Text>{`Add to ${column.title}`}</Text>}
        renderEmptyColumn={() => <Text>Drop cards here</Text>}
      />
    );
    expect(screen.getByText('low:Write docs@todo#0')).toBeTruthy();
    expect(screen.getByText('high:Ship it@todo#1')).toBeTruthy();
    expect(screen.getByText('To do (2)')).toBeTruthy();
    expect(screen.getByText('Add to Done')).toBeTruthy();
    expect(screen.getByText('Drop cards here')).toBeTruthy();
    expect(screen.queryByText('No cards')).toBeNull();
  });

  it('makes cards pressable buttons when onCardPress is set', async () => {
    const onCardPress = jest.fn();
    await render(<Board board={board} onCardPress={onCardPress} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    await fireEvent.press(screen.getByText('Ship it'));
    expect(onCardPress).toHaveBeenCalledTimes(1);
    const [card, info] = onCardPress.mock.calls[0] as [
      Task,
      { index: number; column: { id: string } },
    ];
    expect(card.id).toBe(2);
    expect(info.index).toBe(1);
    expect(info.column.id).toBe('todo');
  });

  it('does not render buttons without onCardPress', async () => {
    await render(<Board board={board} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('uses default column widths per density, or a fixed width', async () => {
    const { rerender } = await render(<Board board={board} />);
    expect(styleOf('kanban-column-todo').width).toBe(280);
    await rerender(<Board board={board} density="compact" />);
    expect(styleOf('kanban-column-todo').width).toBe(240);
    await rerender(<Board board={board} columnWidth={320} />);
    expect(styleOf('kanban-column-todo').width).toBe(320);
  });

  it('sizes fullScreen columns to the measured board width', async () => {
    await render(<Board board={board} columnWidth="fullScreen" />);
    await layoutBoard(400);
    expect(styleOf('kanban-column-todo').width).toBe(
      400 - lightTheme.spacing.boardPadding * 2
    );
  });

  it('sizes columns to their content and caps them at the board height', async () => {
    await render(<Board board={board} />);
    await layoutBoard(400);
    const column = styleOf('kanban-column-todo');
    expect(column.alignSelf).toBe('flex-start');
    expect(column.maxHeight).toBe(800 - lightTheme.spacing.boardPadding * 2);
  });

  it("stretches columns to the board height with columnHeight='fill'", async () => {
    await render(<Board board={board} columnHeight="fill" />);
    await layoutBoard(400);
    const column = styleOf('kanban-column-todo');
    expect(column.alignSelf).toBeUndefined();
    expect(column.maxHeight).toBeUndefined();
  });

  it('applies the theme and per-part style overrides', async () => {
    await render(
      <Board
        board={board}
        theme="dark"
        styles={{ column: { borderWidth: 2 }, card: { borderRadius: 2 } }}
      />
    );
    expect(styleOf('kanban-board').backgroundColor).toBe(
      darkTheme.colors.background
    );
    const column = styleOf('kanban-column-todo');
    expect(column.backgroundColor).toBe(darkTheme.colors.column);
    expect(column.borderWidth).toBe(2);
  });

  it('applies custom theme tokens', async () => {
    await render(
      <Board
        board={board}
        theme={{ base: 'light', colors: { column: '#123456' } }}
      />
    );
    expect(styleOf('kanban-column-todo').backgroundColor).toBe('#123456');
  });

  it('exposes the resolved theme to render props via useKanbanTheme', async () => {
    function ThemedCard({ title }: { title?: string }) {
      const theme = useKanbanTheme();
      return <Text>{`${title} in ${theme.scheme}/${theme.density}`}</Text>;
    }
    await render(
      <Board
        board={board}
        theme="dark"
        density="compact"
        renderCard={(card) => <ThemedCard title={card.title} />}
      />
    );
    expect(screen.getByText('Ship it in dark/compact')).toBeTruthy();
  });
});
