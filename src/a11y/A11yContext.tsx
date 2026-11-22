import { createContext, useContext, type RefObject } from 'react';
import type { AccessibilityActionInfo } from 'react-native';
import type { KanbanLabels } from '../components/types';
import type { KanbanCard, KanbanColumn } from '../types';
import type { CardActionName, ColumnActionName } from './moves';

/** Screen-reader support shared by the board's cards and column headers. */
export interface KanbanA11y {
  /** Actions are on (`disableAccessibilityActions` is not set). */
  enabled: boolean;
  labels: KanbanLabels;
  /** The Move actions a card offers right now. */
  cardActions(
    card: KanbanCard,
    column: KanbanColumn,
    index: number
  ): AccessibilityActionInfo[];
  performCardAction(
    card: KanbanCard,
    column: KanbanColumn,
    index: number,
    action: CardActionName
  ): void;
  /** The Move actions a column header offers right now. */
  columnActions(column: KanbanColumn, index: number): AccessibilityActionInfo[];
  performColumnAction(
    column: KanbanColumn,
    index: number,
    action: ColumnActionName
  ): void;
  /**
   * `card:<key>` or `column:<key>`: the item a move just placed, which takes
   * screen-reader focus once it has rendered in its new spot.
   */
  focusTarget: RefObject<string | null>;
}

const A11yContext = createContext<KanbanA11y | null>(null);

export const A11yProvider = A11yContext.Provider;

export function useKanbanA11y(): KanbanA11y {
  const value = useContext(A11yContext);
  if (!value) {
    throw new Error('react-native-kanban: cards must render inside <Board>.');
  }
  return value;
}
