/**
 * Core data model for react-native-kanban.
 *
 * The shape follows the web library react-kanban
 * (`{ columns: [{ id, title, cards: [{ id, title, description }] }] }`)
 * so boards can be shared between web and mobile code.
 *
 * Types are prefixed with `Kanban` so the names `Board`, `Column` and `Card`
 * stay free for the components that arrive in later releases.
 */

/** Identifier for a card or column. Must be unique within its board. */
export type KanbanId = string | number;

/** A single card. Add any extra fields your app needs via generics. */
export interface KanbanCard {
  id: KanbanId;
  title?: string;
  description?: string;
}

/** A column (lane) holding an ordered list of cards. */
export interface KanbanColumn<TCard extends KanbanCard = KanbanCard> {
  id: KanbanId;
  title?: string;
  cards: TCard[];
}

/** The whole board: an ordered list of columns. */
export interface KanbanBoard<
  TCard extends KanbanCard = KanbanCard,
  TColumn extends KanbanColumn<TCard> = KanbanColumn<TCard>,
> {
  columns: TColumn[];
}

/** Where a dragged card came from. */
export interface CardSource {
  fromColumnId: KanbanId;
  fromPosition: number;
}

/** Where a dragged card was dropped. */
export interface CardDestination {
  toColumnId: KanbanId;
  toPosition: number;
}

/** Where a dragged column came from. */
export interface ColumnSource {
  fromPosition: number;
}

/** Where a dragged column was dropped. */
export interface ColumnDestination {
  toPosition: number;
}
