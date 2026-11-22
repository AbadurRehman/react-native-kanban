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
import { Board, type BoardBaseProps, type KanbanBoard } from '../index';
import { layout, queueLift } from '../__fixtures__/dragHarness';

// Drag visuals are hidden from screen readers; tests still look at them.
const HIDDEN = { includeHiddenElements: true };

/**
 * "todo" holds 300 cards, "done" one. With `estimatedCardHeight` 72 and the
 * 8pt card gap, todo card i starts at 80 * i in the column's scroll content.
 * Columns as in the drag harness: todo at x 16, done at 308, card viewports
 * 260 tall starting 52pt below the board's top.
 */
const longBoard: KanbanBoard = {
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: Array.from({ length: 300 }, (_, i) => ({
        id: i + 1,
        title: `Card ${i + 1}`,
      })),
    },
    { id: 'done', title: 'Done', cards: [{ id: 'd', title: 'Done card' }] },
  ],
};

async function renderLong(props: Partial<BoardBaseProps> = {}) {
  await render(
    <Board initialBoard={longBoard} estimatedCardHeight={72} {...props} />
  );
  await layout('kanban-board-viewport', 0, 0, 800, 800);
  await layout('kanban-column-todo', 16, 16, 280, 300);
  await layout('kanban-column-done', 308, 16, 280, 300);
  await layout('kanban-column-viewport-todo', 0, 36, 280, 260);
  await layout('kanban-column-viewport-done', 0, 36, 280, 260);
  await layout('kanban-card-d', 12, 0, 256, 60);
}

/** Ids of the cards "todo" renders, in order. */
const rendered = () =>
  within(screen.getByTestId('kanban-column-todo'))
    .queryAllByTestId(/^kanban-card-\d+$/)
    .map((node) =>
      Number(String(node.props.testID).slice('kanban-card-'.length))
    );

const heightOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style).height as number;

async function scrollTodo(y: number) {
  await act(async () => {
    fireEvent.scroll(screen.getByTestId('kanban-column-scroll-todo'), {
      nativeEvent: {
        contentOffset: { x: 0, y },
        contentSize: { width: 280, height: 300 * 80 },
        layoutMeasurement: { width: 280, height: 260 },
      },
    });
  });
}

describe('card windowing', () => {
  it('renders only the cards near the viewport', async () => {
    await renderLong();
    const ids = rendered();
    expect(ids[0]).toBe(1);
    expect(ids.length).toBeGreaterThan(3); // the viewport fits ~3.3 cards
    expect(ids.length).toBeLessThan(60);
    // The rest keeps its room, so the column scrolls as far as before.
    const below = 300 - ids.length;
    expect(heightOf('kanban-cards-below')).toBe(below * 80 - 8);
    expect(screen.queryByTestId('kanban-cards-above')).toBeNull();
  });

  it('renders the cards scrolled into view', async () => {
    await renderLong();
    await scrollTodo(8000); // card 101 (index 100) is at the top
    const ids = rendered();
    expect(ids).toContain(101);
    expect(ids).toContain(104);
    expect(ids).not.toContain(1);
    const first = ids[0]!;
    expect(heightOf('kanban-cards-above')).toBe((first - 1) * 80 - 8);
    // Back to the top.
    await scrollTodo(0);
    expect(rendered()[0]).toBe(1);
  });

  it('keeps the size of cards that scrolled out', async () => {
    await renderLong();
    await layout('kanban-card-1', 12, 0, 256, 100); // 28pt taller than assumed
    await scrollTodo(8000);
    const first = rendered()[0]!;
    expect(heightOf('kanban-cards-above')).toBe((first - 1) * 80 + 28 - 8);
  });

  it('renders every card with virtualize={false}', async () => {
    await renderLong({ virtualize: false });
    expect(rendered()).toHaveLength(300);
    expect(screen.queryByTestId('kanban-cards-below')).toBeNull();
  });

  it('drops into a scrolled column at the right index', async () => {
    const onCardDragEnd = jest.fn();
    await renderLong({ onCardDragEnd });
    await scrollTodo(8000);
    // Lift the "done" card (window 400, 80) and hover the top of "todo":
    // its center lands at content y 8030, past card 100's middle (7956).
    queueLift(0, { pageX: 320, pageY: 52 });
    await act(async () => {
      fireGestureHandler(getByGestureTestId('kanban-card-drag-d'), [
        { state: State.BEGAN, absoluteX: 400, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 400, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 100, absoluteY: 80 },
        { state: State.END },
      ]);
    });
    expect(onCardDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { toColumnId: 'todo', toPosition: 100 },
      })
    );
    // It shows up where it was dropped.
    const ids = within(screen.getByTestId('kanban-column-todo'))
      .queryAllByTestId(/^kanban-card-/)
      .map((node) => String(node.props.testID));
    expect(ids).toContain('kanban-card-d');
  });

  it('only adds landing spots for the rendered cards', async () => {
    await renderLong();
    // The 260pt viewport plus 260pt of overscan below it (0–520): cards 1–7.
    expect(rendered()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    queueLift(1);
    const gesture = createGestureController(
      getByGestureTestId('kanban-card-drag-1')
    );
    await act(async () => {
      gesture.begin({ absoluteX: 100, absoluteY: 80 });
      gesture.activate({ absoluteX: 100, absoluteY: 80 });
    });
    const todo = within(screen.getByTestId('kanban-column-todo'));
    // One before every rendered card but the lifted one (still mounted); no
    // end spacer, as the window stops before the last card.
    expect(todo.getAllByTestId('kanban-spacer', HIDDEN)).toHaveLength(
      rendered().length - 1
    );
    expect(rendered().length).toBeLessThan(10);
    expect(todo.queryByTestId('kanban-spacer-end', HIDDEN)).toBeNull();
    await act(async () => gesture.end());
  });
});
