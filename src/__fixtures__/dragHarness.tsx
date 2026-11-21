import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { KanbanBoard } from '../index';

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

export const initial: KanbanBoard = {
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

export const layout = (
  testID: string,
  x: number,
  y: number,
  width: number,
  height: number
) =>
  fireEvent(screen.getByTestId(testID), 'layout', {
    nativeEvent: { layout: { x, y, width, height } },
  });

export async function measureBoard() {
  await layout('kanban-board-viewport', 0, 0, 800, 800);
  await layout('kanban-column-todo', 16, 16, 280, 300);
  await layout('kanban-column-done', 308, 16, 280, 300);
  await layout('kanban-column-viewport-todo', 0, 36, 280, 260);
  await layout('kanban-column-viewport-done', 0, 36, 280, 260);
  await layout('kanban-card-1', 12, 0, 256, 60);
  await layout('kanban-card-2', 12, 68, 256, 60);
}

// Window positions of each card (column x 16 + inset 12, viewport top 52).
export const CARD_BOX: Record<number, { pageX: number; pageY: number }> = {
  1: { pageX: 28, pageY: 52 },
  2: { pageX: 28, pageY: 120 },
};
const { __queueMeasure } = require('react-native-reanimated') as {
  __queueMeasure: (...boxes: object[]) => void;
};
export const queueLift = (
  id: number,
  box: { pageX: number; pageY: number; height?: number } = CARD_BOX[id]!
) =>
  __queueMeasure(
    { x: 0, y: 0, width: 256, height: 60, ...box },
    { x: 0, y: 0, width: 800, height: 800, pageX: 0, pageY: 0 }
  );

/** Long-press card `id`, move through `points`, then release. */
export async function drag(
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

export const titlesIn = (columnId: string) =>
  within(screen.getByTestId(`kanban-column-${columnId}`))
    .queryAllByTestId(/^kanban-card-/)
    .map((node) => String(node.props.testID).replace('kanban-card-', ''));
