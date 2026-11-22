import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, Platform, Text } from 'react-native';
import {
  Board,
  moveCard,
  type BoardBaseProps,
  type KanbanBoard,
} from '../index';
import { layout, titlesIn } from '../__fixtures__/dragHarness';

/** To do: One, Two · Doing: Three · Done: (empty) */
const board: KanbanBoard = {
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [
        { id: 1, title: 'One' },
        { id: 2, title: 'Two' },
      ],
    },
    { id: 'doing', title: 'Doing', cards: [{ id: 3, title: 'Three' }] },
    { id: 'done', title: 'Done', cards: [] },
  ],
};

// The screen-reader element: the Pressable when cards can be pressed.
const card = (id: number) =>
  screen.queryByTestId(`kanban-press-${id}`, { includeHiddenElements: true }) ??
  screen.getByTestId(`kanban-content-${id}`, { includeHiddenElements: true });
const header = (id: string) =>
  screen.getByTestId(`kanban-column-heading-${id}`).props;
const actionNames = (props: { accessibilityActions?: { name: string }[] }) =>
  (props.accessibilityActions ?? []).map((a) => a.name);
const actionLabels = (props: { accessibilityActions?: { label?: string }[] }) =>
  (props.accessibilityActions ?? []).map((a) => a.label);

async function act11y(target: object, actionName: string) {
  await act(async () => {
    fireEvent(target as never, 'accessibilityAction', {
      nativeEvent: { actionName },
    });
  });
}

const columnOrder = () =>
  screen
    .queryAllByTestId(/^kanban-column-(todo|doing|done)$/)
    .map((node) => String(node.props.testID).replace('kanban-column-', ''));

const announced = () =>
  (
    AccessibilityInfo.announceForAccessibilityWithOptions as jest.Mock
  ).mock.calls.map((call) => call[0]);

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderBoard(props: Partial<BoardBaseProps> = {}) {
  await render(<Board initialBoard={board} {...props} />);
  await layout('kanban-board-viewport', 0, 0, 1000, 800);
}

describe('cards for screen readers', () => {
  it('are one element with their place in the column', async () => {
    await renderBoard();
    const two = card(2).props;
    expect(two.accessible).toBe(true);
    expect(two.accessibilityValue).toEqual({ text: '2 of 2 in To do' });
    // Not a button unless cards can be pressed.
    expect(two.accessibilityRole).toBeUndefined();
  });

  it('on Android, read their text then their place (no value text)', async () => {
    // Android makes accessibilityValue.text the whole content description,
    // which would hide the card's own text from TalkBack.
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await renderBoard();
      const two = card(2);
      expect(two.props.accessible).toBe(true);
      expect(two.props.accessibilityValue).toBeUndefined();
      expect(within(two).getByText('2 of 2 in To do')).toBeTruthy();
    } finally {
      os.restore();
    }
  });

  it('offer moves up, down and to the neighbouring columns', async () => {
    await renderBoard();
    expect(actionLabels(card(1).props)).toEqual(['Move down', 'Move to Doing']);
    expect(actionLabels(card(2).props)).toEqual(['Move up', 'Move to Doing']);
    expect(actionLabels(card(3).props)).toEqual([
      'Move to To do',
      'Move to Done',
    ]);
  });

  it('moves a card down and announces it', async () => {
    const onCardDragEnd = jest.fn();
    const onBoardChange = jest.fn();
    await render(
      <Board
        initialBoard={board}
        onCardDragEnd={onCardDragEnd}
        onBoardChange={onBoardChange}
      />
    );
    await act11y(card(1), 'moveDown');
    expect(titlesIn('todo')).toEqual(['2', '1']);
    expect(onCardDragEnd).toHaveBeenCalledWith({
      card: board.columns[0]!.cards[0],
      source: { fromColumnId: 'todo', fromPosition: 0 },
      destination: { toColumnId: 'todo', toPosition: 1 },
      via: 'accessibility',
    });
    expect(onBoardChange).toHaveBeenCalledTimes(1);
    expect(announced()).toEqual(['Moved One to To do, 2 of 2']);
    expect(card(1).props.accessibilityValue).toEqual({
      text: '2 of 2 in To do',
    });
  });

  it('moves a card to the next column at the same index', async () => {
    await renderBoard();
    await act11y(card(2), 'moveToNextColumn');
    // Index 1 in a one-card column: the end.
    expect(titlesIn('doing')).toEqual(['3', '2']);
    expect(announced()).toEqual(['Moved Two to Doing, 2 of 2']);
  });

  it('moves focus to the card after it changed columns', async () => {
    await renderBoard();
    await act11y(card(1), 'moveToNextColumn');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    const focused = (AccessibilityInfo.sendAccessibilityEvent as jest.Mock).mock
      .calls;
    expect(focused).toHaveLength(1);
    expect(focused[0]![1]).toBe('focus');
  });

  it('report the move in controlled mode', async () => {
    function Controlled() {
      const [value, setValue] = useState(board);
      return (
        <Board
          board={value}
          onCardDragEnd={({ source, destination }) =>
            setValue((b) => moveCard(b, source, destination))
          }
        />
      );
    }
    await render(<Controlled />);
    await act11y(card(3), 'moveToPreviousColumn');
    expect(titlesIn('todo')).toEqual(['3', '1', '2']);
  });

  it('skip columns that turn the card away', async () => {
    await renderBoard({
      canDropCard: ({ toColumn }) => toColumn.id !== 'doing',
    });
    expect(actionLabels(card(1).props)).toEqual(['Move down', 'Move to Done']);
    await act11y(card(1), 'moveToNextColumn');
    expect(titlesIn('done')).toEqual(['1']);
  });

  it('have no moves when locked, but can still be pressed', async () => {
    const onCardPress = jest.fn();
    await renderBoard({
      canDragCard: (c) => c.id !== 1,
      onCardPress,
    });
    const one = card(1).props;
    expect(actionNames(one)).toEqual(['activate']);
    expect(one.accessibilityRole).toBe('button');
    await act11y(card(1), 'activate');
    expect(onCardPress).toHaveBeenCalledWith(
      board.columns[0]!.cards[0],
      expect.objectContaining({ index: 0 })
    );
    // Other cards still move.
    expect(actionNames(card(2).props)).toContain('moveUp');
  });

  it('have no moves with disableCardDrag', async () => {
    await renderBoard({ disableCardDrag: true });
    expect(actionNames(card(1).props)).toEqual([]);
  });

  it('can be left to the card content with disableAccessibilityActions', async () => {
    const onCardPress = jest.fn();
    await renderBoard({ disableAccessibilityActions: true, onCardPress });
    const one = screen.getByTestId('kanban-content-1').props;
    expect(one.accessible).toBeUndefined();
    expect(one.accessibilityActions).toBeUndefined();
    // The press target is its own button again.
    expect(screen.getAllByRole('button', { name: 'One' })).toHaveLength(1);
  });

  it('use translated labels', async () => {
    await renderBoard({
      labels: {
        moveCardDown: 'Nach unten',
        moveCardToColumn: (column) => `Nach ${column}`,
        cardPosition: ({ position, count }) => `${position} von ${count}`,
      },
    });
    expect(actionLabels(card(1).props)).toEqual(['Nach unten', 'Nach Doing']);
    expect(card(1).props.accessibilityValue).toEqual({ text: '1 von 2' });
  });
});

describe('column headers for screen readers', () => {
  it('are headings with the card count', async () => {
    await renderBoard();
    const todo = header('todo');
    expect(todo.accessible).toBe(true);
    expect(todo.accessibilityRole).toBe('header');
    expect(todo.accessibilityLabel).toBe('To do, 2 cards');
    expect(header('doing').accessibilityLabel).toBe('Doing, 1 card');
  });

  it('offer moves before and after their neighbours', async () => {
    await renderBoard();
    expect(actionLabels(header('todo'))).toEqual(['Move after Doing']);
    expect(actionLabels(header('doing'))).toEqual([
      'Move before To do',
      'Move after Done',
    ]);
  });

  it('move a column and announce it', async () => {
    const onColumnDragEnd = jest.fn();
    await renderBoard({ onColumnDragEnd });
    await act11y(screen.getByTestId('kanban-column-heading-todo'), 'moveAfter');
    expect(columnOrder()).toEqual(['doing', 'todo', 'done']);
    expect(onColumnDragEnd).toHaveBeenCalledWith({
      column: board.columns[0],
      source: { fromPosition: 0 },
      destination: { toPosition: 1 },
      via: 'accessibility',
    });
    expect(announced()).toEqual(['Moved To do to position 2 of 3']);
    // Its actions follow its new place.
    expect(actionLabels(header('todo'))).toEqual([
      'Move before Doing',
      'Move after Done',
    ]);
  });

  it('have no moves with disableColumnDrag', async () => {
    await renderBoard({ disableColumnDrag: true });
    expect(header('todo').accessibilityRole).toBe('header');
    expect(header('todo').accessibilityActions).toBeUndefined();
  });

  it('leave custom headers to read their own content', async () => {
    await renderBoard({
      renderColumnHeader: (column) => <Text>{`# ${column.title}`}</Text>,
    });
    expect(header('todo').accessibilityLabel).toBeUndefined();
    expect(header('todo').accessibilityRole).toBe('header');
  });
});

describe('moves into a long column', () => {
  it('render the moved card even outside the window', async () => {
    const long: KanbanBoard = {
      columns: [
        {
          id: 'todo',
          title: 'To do',
          cards: Array.from({ length: 300 }, (_, i) => ({
            id: i + 1,
            title: `Card ${i + 1}`,
          })),
        },
        {
          id: 'done',
          title: 'Done',
          cards: Array.from({ length: 150 }, (_, i) => ({
            id: 1000 + i,
            title: `Done ${i}`,
          })),
        },
      ],
    };
    await render(<Board initialBoard={long} estimatedCardHeight={72} />);
    await layout('kanban-board-viewport', 0, 0, 1000, 800);
    await layout('kanban-column-viewport-todo', 0, 36, 280, 260);
    await layout('kanban-column-viewport-done', 0, 36, 280, 260);
    // "Done 120" is far below the window of either column; render it so the
    // action can reach it, then move it across at index 120.
    await act(async () => {
      fireEvent.scroll(screen.getByTestId('kanban-column-scroll-done'), {
        nativeEvent: {
          contentOffset: { x: 0, y: 120 * 80 },
          contentSize: { width: 280, height: 150 * 80 },
          layoutMeasurement: { width: 280, height: 260 },
        },
      });
    });
    expect(titlesIn('todo')).not.toContain('121');
    await act11y(card(1120), 'moveToPreviousColumn');
    expect(titlesIn('todo')).toContain('1120');
  });
});
