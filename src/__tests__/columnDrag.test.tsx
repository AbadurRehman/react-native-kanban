import { describe, expect, it, jest } from '@jest/globals';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  createGestureController,
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import {
  Board,
  moveColumn,
  type BoardBaseProps,
  type KanbanBoard,
} from '../index';
import { layout, queueLift, titlesIn } from '../__fixtures__/dragHarness';

// Drag visuals are hidden from screen readers; tests still look at them.
const HIDDEN = { includeHiddenElements: true };

/**
 * Three columns, 280 wide, 12 apart, after 16pt of board padding:
 *   todo 16–296 (cards 1, 2)   doing 308–588 (card 3)   done 600–880 (empty)
 * Every column is 300 tall at y 16; card viewports start 52pt down.
 */
const board3: KanbanBoard = {
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
const COLUMN_X: Record<string, number> = { todo: 16, doing: 308, done: 600 };

async function measure3() {
  await layout('kanban-board-viewport', 0, 0, 1000, 800);
  for (const [id, x] of Object.entries(COLUMN_X)) {
    await layout(`kanban-column-${id}`, x, 16, 280, 300);
    await layout(`kanban-column-viewport-${id}`, 0, 36, 280, 260);
  }
  await layout('kanban-card-1', 12, 0, 256, 60);
  await layout('kanban-card-2', 12, 68, 256, 60);
  await layout('kanban-card-3', 12, 0, 256, 60);
}

const { __queueMeasure } = require('react-native-reanimated') as {
  __queueMeasure: (...boxes: object[]) => void;
};
/** The boxes a column lift measures: the column, then the board. */
const queueColumnLift = (pageX: number) =>
  __queueMeasure(
    { x: 0, y: 0, width: 280, height: 300, pageX, pageY: 16 },
    { x: 0, y: 0, width: 1000, height: 800, pageX: 0, pageY: 0 }
  );

/**
 * Long-press column `id`'s header at `start`, move through `points`, then
 * release. `pageX` is where the column sits on screen (its board position).
 */
async function dragColumn(
  id: string,
  points: Array<[number, number]>,
  pageX = COLUMN_X[id]!
) {
  const [start] = points;
  queueColumnLift(pageX);
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`kanban-column-drag-${id}`), [
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

const columnOrder = () =>
  screen
    .queryAllByTestId(/^kanban-column-(todo|doing|done)$/)
    .map((node) => String(node.props.testID).replace('kanban-column-', ''));

const headerConfig = (id: string) =>
  (
    getByGestureTestId(`kanban-column-drag-${id}`) as unknown as {
      config: Record<string, unknown>;
    }
  ).config;

async function renderBoard(props: Partial<BoardBaseProps> = {}) {
  await render(<Board initialBoard={board3} {...props} />);
  await measure3();
}

describe('column drag and drop', () => {
  it('moves a column (uncontrolled)', async () => {
    const onBoardChange = jest.fn();
    const onColumnDragStart = jest.fn();
    const onColumnDragEnd = jest.fn();
    await render(
      <Board
        initialBoard={board3}
        onBoardChange={onBoardChange}
        onColumnDragStart={onColumnDragStart}
        onColumnDragEnd={onColumnDragEnd}
      />
    );
    await measure3();

    // Grab "todo" by its header (84pt in) and move its center past the
    // middle of "doing" (448): finger at 500 puts the center at 556.
    await dragColumn('todo', [
      [100, 30],
      [500, 40],
    ]);

    expect(onColumnDragStart).toHaveBeenLastCalledWith({
      column: board3.columns[0],
      source: { fromPosition: 0 },
    });
    expect(onColumnDragEnd).toHaveBeenLastCalledWith({
      column: board3.columns[0],
      source: { fromPosition: 0 },
      destination: { toPosition: 1 },
      via: 'drag',
    });
    expect(onBoardChange).toHaveBeenCalledTimes(1);
    expect(columnOrder()).toEqual(['doing', 'todo', 'done']);
    // Cards travel with their column.
    expect(titlesIn('todo')).toEqual(['1', '2']);
    expect(
      screen.queryByTestId('kanban-column-drag-overlay', HIDDEN)
    ).toBeNull();
    expect(screen.queryByTestId('kanban-column-spacer', HIDDEN)).toBeNull();
  });

  it('drops a column at the end', async () => {
    await renderBoard();
    // Center past the middle of "done" (740).
    await dragColumn('todo', [
      [100, 30],
      [700, 40],
    ]);
    expect(columnOrder()).toEqual(['doing', 'done', 'todo']);
  });

  it('puts the column back when dropped where it started', async () => {
    const onColumnDragEnd = jest.fn();
    const onBoardChange = jest.fn();
    await render(
      <Board
        initialBoard={board3}
        onBoardChange={onBoardChange}
        onColumnDragEnd={onColumnDragEnd}
      />
    );
    await measure3();
    // A small wobble: the center never reaches a neighbour's middle.
    await dragColumn('doing', [
      [400, 30],
      [430, 40],
      [380, 40],
    ]);
    expect(onColumnDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { fromPosition: 1 },
        destination: { toPosition: 1 },
      })
    );
    expect(onBoardChange).not.toHaveBeenCalled();
    expect(columnOrder()).toEqual(['todo', 'doing', 'done']);
  });

  it('places columns by order after a reorder (no new layout events)', async () => {
    await renderBoard();
    await dragColumn('todo', [
      [100, 30],
      [500, 40],
    ]); // doing, todo, done
    // Measured x values are stale now (web only reports size changes).
    // "done" sits at 600; drag it to the front.
    await dragColumn('done', [
      [650, 30],
      [20, 40],
    ]);
    expect(columnOrder()).toEqual(['done', 'doing', 'todo']);

    // Card drops find columns by their new positions too: "todo" is third
    // (600–880), so card 1 starts at 612.
    queueLift(1, { pageX: 612, pageY: 52 });
    await act(async () => {
      fireGestureHandler(getByGestureTestId('kanban-card-drag-1'), [
        { state: State.BEGAN, absoluteX: 650, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 650, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 100, absoluteY: 80 },
        { state: State.END },
      ]);
    });
    expect(titlesIn('done')).toEqual(['1']);
  });

  it('works in controlled mode with moveColumn', async () => {
    function Controlled() {
      const [board, setBoard] = useState(board3);
      return (
        <Board
          board={board}
          onColumnDragEnd={({ source, destination }) =>
            setBoard((b) => moveColumn(b, source, destination))
          }
        />
      );
    }
    await render(<Controlled />);
    await measure3();
    await dragColumn('done', [
      [650, 30],
      [350, 40],
    ]);
    expect(columnOrder()).toEqual(['todo', 'done', 'doing']);
  });

  it('goes back in controlled mode when the move is not applied', async () => {
    const onColumnDragEnd = jest.fn();
    await render(<Board board={board3} onColumnDragEnd={onColumnDragEnd} />);
    await measure3();
    await dragColumn('todo', [
      [100, 30],
      [500, 40],
    ]);
    expect(onColumnDragEnd).toHaveBeenCalledTimes(1);
    expect(columnOrder()).toEqual(['todo', 'doing', 'done']);
  });

  it('lifts a copy and leaves the column in place, invisible', async () => {
    await renderBoard();
    queueColumnLift(16);
    const gesture = createGestureController(
      getByGestureTestId('kanban-column-drag-todo')
    );
    await act(async () => {
      gesture.begin({ absoluteX: 100, absoluteY: 30 });
      gesture.activate({ absoluteX: 100, absoluteY: 30 });
    });

    const overlay = screen.getByTestId('kanban-column-drag-overlay', HIDDEN);
    expect(within(overlay).getByText('To do', HIDDEN)).toBeTruthy();
    expect(within(overlay).getByText('One', HIDDEN)).toBeTruthy();
    expect(within(overlay).getByText('Two', HIDDEN)).toBeTruthy();
    expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({
      width: 280,
      height: 300,
    });

    // The column stays mounted (its header gesture keeps running), out of
    // the layout at its old spot, with no background. It must stay
    // hit-testable (iOS cancels the gesture otherwise): only content fades.
    const original = screen.getByTestId('kanban-column-todo');
    const style = StyleSheet.flatten(original.props.style);
    expect(style).toMatchObject({
      position: 'absolute',
      left: 16,
      top: 16,
      height: 300,
      backgroundColor: 'transparent',
    });
    expect(style.opacity).toBeUndefined();
    expect(original.props.pointerEvents).toBeUndefined();
    const viewport = screen.getByTestId('kanban-column-viewport-todo', {
      includeHiddenElements: true,
    });
    expect(StyleSheet.flatten(viewport.props.style)).toMatchObject({
      opacity: 0,
    });
    expect(viewport.props.accessibilityElementsHidden).toBe(true);

    // Landing spots before "doing" and "done", one at the end; the one at
    // the column's own slot starts open.
    expect(screen.getAllByTestId('kanban-column-spacer', HIDDEN)).toHaveLength(
      2
    );
    expect(screen.getByTestId('kanban-column-spacer-end', HIDDEN)).toBeTruthy();
    const [first] = screen.getAllByTestId('kanban-column-placeholder', HIDDEN);
    expect(StyleSheet.flatten(first!.props.style)).toMatchObject({
      width: 280,
      height: 300,
    });

    // No card can lift while a column is dragged (nothing is measured, so
    // no boxes are queued).
    await act(async () => {
      fireGestureHandler(getByGestureTestId('kanban-card-drag-3'), [
        { state: State.BEGAN, absoluteX: 400, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 400, absoluteY: 80 },
        { state: State.END },
      ]);
    });
    expect(screen.queryByTestId('kanban-drag-overlay', HIDDEN)).toBeNull();

    await act(async () => {
      gesture.update({ absoluteX: 500, absoluteY: 40 });
      gesture.end();
    });
    expect(
      screen.queryByTestId('kanban-column-drag-overlay', HIDDEN)
    ).toBeNull();
    expect(
      StyleSheet.flatten(screen.getByTestId('kanban-column-todo').props.style)
        .position
    ).toBeUndefined();
    expect(columnOrder()).toEqual(['doing', 'todo', 'done']);
  });

  it('copies only the cards in view', async () => {
    await renderBoard();
    // Scroll "todo" so card 1 (0–60) is out of view and card 2 starts 2pt
    // above the viewport.
    await act(async () => {
      fireEvent.scroll(screen.getByTestId('kanban-column-scroll-todo'), {
        nativeEvent: {
          contentOffset: { x: 0, y: 70 },
          contentSize: { width: 280, height: 400 },
          layoutMeasurement: { width: 280, height: 260 },
        },
      });
    });
    queueColumnLift(16);
    const gesture = createGestureController(
      getByGestureTestId('kanban-column-drag-todo')
    );
    await act(async () => {
      gesture.begin({ absoluteX: 100, absoluteY: 30 });
      gesture.activate({ absoluteX: 100, absoluteY: 30 });
    });
    const overlay = within(
      screen.getByTestId('kanban-column-drag-overlay', HIDDEN)
    );
    expect(overlay.queryByText('One', HIDDEN)).toBeNull();
    expect(overlay.getByText('Two', HIDDEN)).toBeTruthy();
    await act(async () => gesture.end());
  });

  it('can not start while a card is dragged', async () => {
    const onColumnDragStart = jest.fn();
    await renderBoard({ onColumnDragStart });
    queueLift(1);
    const card = createGestureController(
      getByGestureTestId('kanban-card-drag-1')
    );
    await act(async () => {
      card.begin({ absoluteX: 100, absoluteY: 80 });
      card.activate({ absoluteX: 100, absoluteY: 80 });
    });
    // The header gesture bails out before measuring: queue nothing.
    await act(async () => {
      fireGestureHandler(getByGestureTestId('kanban-column-drag-doing'), [
        { state: State.BEGAN, absoluteX: 400, absoluteY: 30 },
        { state: State.ACTIVE, absoluteX: 400, absoluteY: 30 },
        { state: State.ACTIVE, absoluteX: 700, absoluteY: 40 },
        { state: State.END },
      ]);
    });
    expect(onColumnDragStart).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId('kanban-column-drag-overlay', HIDDEN)
    ).toBeNull();
    await act(async () => card.end());
  });
});

describe('column drag options', () => {
  it('lifts after the drag activation delay', async () => {
    await renderBoard({ dragActivationDelay: 600 });
    expect(headerConfig('todo').activateAfterLongPress).toBe(600);
    expect(headerConfig('todo').enabled).toBe(true);
  });

  it('turns off with disableColumnDrag', async () => {
    await renderBoard({ disableColumnDrag: true });
    for (const id of ['todo', 'doing', 'done']) {
      expect(headerConfig(id).enabled).toBe(false);
    }
    // Cards still drag.
    expect(
      (
        getByGestureTestId('kanban-card-drag-1') as unknown as {
          config: Record<string, unknown>;
        }
      ).config.enabled
    ).toBe(true);
  });

  it('locks single columns with canDragColumn', async () => {
    await renderBoard({ canDragColumn: (column) => column.id !== 'done' });
    expect(headerConfig('todo').enabled).toBe(true);
    expect(headerConfig('done').enabled).toBe(false);
  });

  it('other columns can still move past a locked one', async () => {
    await renderBoard({ canDragColumn: (column) => column.id !== 'done' });
    await dragColumn('todo', [
      [100, 30],
      [700, 40],
    ]);
    expect(columnOrder()).toEqual(['doing', 'done', 'todo']);
  });

  it('uses custom header renders for the lifted copy', async () => {
    await renderBoard({
      renderColumnHeader: (column) => <Text>{`# ${column.title}`}</Text>,
    });
    queueColumnLift(16);
    const gesture = createGestureController(
      getByGestureTestId('kanban-column-drag-todo')
    );
    await act(async () => {
      gesture.begin({ absoluteX: 100, absoluteY: 30 });
      gesture.activate({ absoluteX: 100, absoluteY: 30 });
    });
    const overlay = within(
      screen.getByTestId('kanban-column-drag-overlay', HIDDEN)
    );
    expect(overlay.getByText('# To do', HIDDEN)).toBeTruthy();
    await act(async () => gesture.end());
  });
});
