import { describe, expect, it, jest } from '@jest/globals';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  createGestureController,
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { Board, moveCard, type KanbanBoard } from '../index';

/**
 * Drives whole drags through the real gesture callbacks. The board sits at
 * the window origin (see the Reanimated mock's `measure`), so window
 * coordinates equal board coordinates.
 *
 * Layout used by every test (board padding 16, columns 280 wide, gap 12):
 *   todo: x 16–296   cards 1 (y 0–60), 2 (y 68–128)
 *   done: x 308–588  empty
 * Both card viewports start 52pt below the board's top.
 */

const initial: KanbanBoard = {
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [
        { id: 1, title: 'One' },
        { id: 2, title: 'Two' },
      ],
    },
    { id: 'done', title: 'Done', cards: [] },
  ],
};

const layout = (
  testID: string,
  x: number,
  y: number,
  width: number,
  height: number
) =>
  fireEvent(screen.getByTestId(testID), 'layout', {
    nativeEvent: { layout: { x, y, width, height } },
  });

async function measureBoard() {
  await layout('kanban-board-viewport', 0, 0, 800, 800);
  await layout('kanban-column-todo', 16, 16, 280, 300);
  await layout('kanban-column-done', 308, 16, 280, 300);
  await layout('kanban-column-viewport-todo', 0, 36, 280, 260);
  await layout('kanban-column-viewport-done', 0, 36, 280, 260);
  await layout('kanban-card-1', 12, 0, 256, 60);
  await layout('kanban-card-2', 12, 68, 256, 60);
}

// Window positions of each card (column x 16 + inset 12, viewport top 52).
const CARD_BOX: Record<number, { pageX: number; pageY: number }> = {
  1: { pageX: 28, pageY: 52 },
  2: { pageX: 28, pageY: 120 },
};
const { __queueMeasure } = require('react-native-reanimated') as {
  __queueMeasure: (...boxes: object[]) => void;
};
const queueLift = (
  id: number,
  box: { pageX: number; pageY: number; height?: number } = CARD_BOX[id]!
) =>
  __queueMeasure(
    { x: 0, y: 0, width: 256, height: 60, ...box },
    { x: 0, y: 0, width: 800, height: 800, pageX: 0, pageY: 0 }
  );

/** Long-press card `id`, move through `points`, then release. */
async function drag(
  id: number,
  points: Array<[number, number]>,
  box?: { pageX: number; pageY: number; height?: number }
) {
  const [start] = points;
  queueLift(id, box);
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`kanban-card-drag-${id}`), [
      { state: State.BEGAN, absoluteX: start![0], absoluteY: start![1] },
      { state: State.ACTIVE, absoluteX: start![0], absoluteY: start![1] },
      ...points.map(([absoluteX, absoluteY]) => ({
        state: State.ACTIVE,
        absoluteX,
        absoluteY,
      })),
      { state: State.END },
    ]);
  });
}

const titlesIn = (columnId: string) =>
  within(screen.getByTestId(`kanban-column-${columnId}`))
    .queryAllByTestId(/^kanban-card-/)
    .map((node) => String(node.props.testID).replace('kanban-card-', ''));

describe('drag and drop', () => {
  it('moves a card to another column (uncontrolled)', async () => {
    const onBoardChange = jest.fn();
    const onCardDragStart = jest.fn();
    const onCardDragEnd = jest.fn();
    await render(
      <Board
        initialBoard={initial}
        onBoardChange={onBoardChange}
        onCardDragStart={onCardDragStart}
        onCardDragEnd={onCardDragEnd}
      />
    );
    await measureBoard();

    // Grab card 1 and drop it into the empty "done" column.
    await drag(1, [
      [100, 80],
      [400, 120],
    ]);

    expect(onCardDragStart).toHaveBeenCalledWith({
      card: initial.columns[0]!.cards[0],
      source: { fromColumnId: 'todo', fromPosition: 0 },
    });
    expect(onCardDragEnd).toHaveBeenCalledWith({
      card: initial.columns[0]!.cards[0],
      source: { fromColumnId: 'todo', fromPosition: 0 },
      destination: { toColumnId: 'done', toPosition: 0 },
    });
    expect(onBoardChange).toHaveBeenCalledTimes(1);
    expect(titlesIn('todo')).toEqual(['2']);
    expect(titlesIn('done')).toEqual(['1']);
    expect(screen.queryByTestId('kanban-drag-overlay')).toBeNull();
    expect(screen.queryByTestId('kanban-placeholder')).toBeNull();
  });

  it('reorders within a column', async () => {
    const onBoardChange = jest.fn();
    await render(
      <Board initialBoard={initial} onBoardChange={onBoardChange} />
    );
    await measureBoard();

    // Card 1 below card 2's midpoint (viewport top 52 + 98 = 150).
    await drag(1, [
      [100, 80],
      [100, 170],
    ]);

    expect(titlesIn('todo')).toEqual(['2', '1']);
    expect(onBoardChange).toHaveBeenCalledTimes(1);
  });

  it('puts the card back when dropped where it started', async () => {
    const onBoardChange = jest.fn();
    const onCardDragEnd = jest.fn();
    await render(
      <Board
        initialBoard={initial}
        onBoardChange={onBoardChange}
        onCardDragEnd={onCardDragEnd}
      />
    );
    await measureBoard();

    await drag(2, [
      [100, 150],
      [110, 155],
    ]);

    expect(onCardDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { fromColumnId: 'todo', fromPosition: 1 },
        destination: { toColumnId: 'todo', toPosition: 1 },
      })
    );
    expect(onBoardChange).not.toHaveBeenCalled();
    expect(titlesIn('todo')).toEqual(['1', '2']);
  });

  it('leaves controlled boards to the parent', async () => {
    const onCardDragEnd = jest.fn();
    const { rerender } = await render(
      <Board board={initial} onCardDragEnd={onCardDragEnd} />
    );
    await measureBoard();
    await drag(1, [
      [100, 80],
      [400, 120],
    ]);

    // The parent didn't apply the move, so nothing changed.
    expect(onCardDragEnd).toHaveBeenCalledTimes(1);
    expect(titlesIn('todo')).toEqual(['1', '2']);

    // Applying it with moveCard moves the card.
    const { source, destination } = onCardDragEnd.mock.calls[0]![0] as any;
    await rerender(
      <Board
        board={moveCard(initial, source, destination)}
        onCardDragEnd={onCardDragEnd}
      />
    );
    expect(titlesIn('done')).toEqual(['1']);
  });

  it('does not move a tall card when it is lifted above a short one', async () => {
    const onCardDragEnd = jest.fn();
    await render(
      <Board initialBoard={initial} onCardDragEnd={onCardDragEnd} />
    );
    await measureBoard();
    // Card 1 is tall (116), card 2 short (60) right below it.
    await layout('kanban-card-1', 12, 0, 256, 116);
    await layout('kanban-card-2', 12, 124, 256, 60);

    // Hold card 1 without moving, then release.
    await drag(
      1,
      [
        [100, 110],
        [101, 112],
      ],
      { pageX: 28, pageY: 52, height: 116 }
    );

    expect(onCardDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { toColumnId: 'todo', toPosition: 0 },
      })
    );
    expect(titlesIn('todo')).toEqual(['1', '2']);
  });

  it('keeps hit testing right after a reorder, without new layout events', async () => {
    const onCardDragEnd = jest.fn();
    await render(
      <Board initialBoard={initial} onCardDragEnd={onCardDragEnd} />
    );
    await measureBoard();

    // Reorder: card 1 below card 2.
    await drag(1, [
      [100, 80],
      [100, 170],
    ]);
    expect(titlesIn('todo')).toEqual(['2', '1']);

    // No layout events fire after the drop (as on device when a card already
    // reached its final spot during the drag). Hold card 1, now second, and
    // release: it must stay second.
    await drag(
      1,
      [
        [100, 150],
        [101, 151],
      ],
      { pageX: 28, pageY: 120 }
    );
    expect(onCardDragEnd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: { fromColumnId: 'todo', fromPosition: 1 },
        destination: { toColumnId: 'todo', toPosition: 1 },
      })
    );
    expect(titlesIn('todo')).toEqual(['2', '1']);
  });

  it('keeps the dragged card mounted and adds landing spots', async () => {
    await render(<Board initialBoard={initial} />);
    await measureBoard();
    queueLift(1);
    const gesture = createGestureController(
      getByGestureTestId('kanban-card-drag-1')
    );
    await act(async () => {
      gesture.begin({ absoluteX: 100, absoluteY: 80 });
      gesture.activate({ absoluteX: 100, absoluteY: 80 });
    });

    // The card floats above the board...
    expect(screen.getByTestId('kanban-drag-overlay')).toBeTruthy();
    // ...while its original view stays mounted (its gesture keeps running),
    // invisible and out of the layout.
    const original = screen.getByTestId('kanban-card-1');
    expect(StyleSheet.flatten(original.props.style)).toMatchObject({
      position: 'absolute',
      opacity: 0,
    });
    // Landing spots: one before card 2 and one at the end of "todo", and the
    // empty "done" column becomes a drop zone.
    const todo = within(screen.getByTestId('kanban-column-todo'));
    expect(todo.getAllByTestId('kanban-spacer')).toHaveLength(1);
    expect(todo.getByTestId('kanban-spacer-end')).toBeTruthy();
    expect(screen.getByTestId('kanban-empty-column')).toBeTruthy();

    await act(async () => {
      gesture.update({ absoluteX: 400, absoluteY: 120 });
      gesture.end();
    });
    expect(screen.queryByTestId('kanban-drag-overlay')).toBeNull();
    expect(screen.queryByTestId('kanban-spacer')).toBeNull();
    expect(titlesIn('done')).toEqual(['1']);
  });

  it('does not drag when disableCardDrag is set', async () => {
    const onCardDragStart = jest.fn();
    await render(
      <Board
        initialBoard={initial}
        disableCardDrag
        onCardDragStart={onCardDragStart}
      />
    );
    await measureBoard();
    await drag(1, [
      [100, 80],
      [400, 120],
    ]);
    expect(onCardDragStart).not.toHaveBeenCalled();
    expect(titlesIn('todo')).toEqual(['1', '2']);
  });

  it('does not fire onCardPress for a press that became a drag', async () => {
    const onCardPress = jest.fn();
    await render(<Board initialBoard={initial} onCardPress={onCardPress} />);
    await measureBoard();
    await fireEvent(screen.getByText('One'), 'pressIn');
    await drag(1, [
      [100, 80],
      [110, 85],
    ]);
    await fireEvent.press(screen.getByText('One'));
    expect(onCardPress).not.toHaveBeenCalled();
  });
});
