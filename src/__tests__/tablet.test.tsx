import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { responsiveColumnWidth } from '../dnd/geometry';
import { Board, type KanbanBoard } from '../index';
import { layout } from '../__fixtures__/dragHarness';

describe('responsiveColumnWidth', () => {
  // Board padding 16 on each side, 12pt gaps.
  const room = (width: number) => width - 32;

  it('gives phones one full-width column', () => {
    // 390pt phone: 358pt of room, one 280pt column fits.
    expect(responsiveColumnWidth(room(390), 12, 5, 280)).toBe(358);
  });

  it('fits whole columns on tablets and shares the room', () => {
    // iPad portrait (820): two columns, (788 - 12) / 2.
    expect(responsiveColumnWidth(room(820), 12, 5, 280)).toBe(388);
    // iPad landscape (1180): three, (1148 - 24) / 3, rounded down.
    expect(responsiveColumnWidth(room(1180), 12, 5, 280)).toBe(374);
    // 12.9" landscape (1366): four, (1334 - 36) / 4.
    expect(responsiveColumnWidth(room(1366), 12, 5, 280)).toBe(324);
  });

  it('stops at max', () => {
    expect(responsiveColumnWidth(room(820), 12, 5, 280, 340)).toBe(340);
  });

  it('never counts more columns than the board has', () => {
    // Two columns on a 1366pt screen share it: (1334 - 12) / 2.
    expect(responsiveColumnWidth(room(1366), 12, 2, 280)).toBe(661);
    expect(responsiveColumnWidth(room(1366), 12, 2, 280, 420)).toBe(420);
    expect(responsiveColumnWidth(room(1366), 12, 0, 280)).toBe(1334);
  });

  it('takes the full width when not even one column fits', () => {
    expect(responsiveColumnWidth(200, 12, 3, 280)).toBe(200);
  });
});

const fiveColumns: KanbanBoard = {
  columns: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id,
    title: id.toUpperCase(),
    cards: [],
  })),
};
const widthOf = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(`kanban-column-${id}`).props.style)
    .width;

describe('responsive columns', () => {
  it('fit the board and re-fit when it resizes', async () => {
    await render(
      <Board initialBoard={fiveColumns} columnWidth={{ min: 280, max: 400 }} />
    );
    // iPad landscape: three per screen.
    await layout('kanban-board-viewport', 0, 0, 1180, 800);
    expect(widthOf('a')).toBe(374);
    // Rotated to portrait: two per screen.
    await layout('kanban-board-viewport', 0, 0, 820, 1100);
    expect(widthOf('a')).toBe(388);
    expect(widthOf('e')).toBe(388);
    // Split view, phone-sized: one, full width.
    await layout('kanban-board-viewport', 0, 0, 390, 800);
    expect(widthOf('a')).toBe(358);
  });

  it('follow custom board padding and gaps', async () => {
    await render(
      <Board
        initialBoard={fiveColumns}
        columnWidth={{ min: 280 }}
        styles={{ boardContent: { paddingHorizontal: 40, gap: 20 } }}
      />
    );
    // (1180 - 80 + 20) / 300 = 3.7 → three: (1100 - 40) / 3.
    await layout('kanban-board-viewport', 0, 0, 1180, 800);
    expect(widthOf('a')).toBe(353);
  });
});
