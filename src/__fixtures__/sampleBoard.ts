import type { KanbanBoard, KanbanCard } from '../types';

export interface TaskCard extends KanbanCard {
  priority: 'low' | 'medium' | 'high';
}

export const sampleBoard: KanbanBoard<TaskCard> = {
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [
        { id: 1, title: 'Design card component', priority: 'high' },
        { id: 2, title: 'Write theme tokens', priority: 'medium' },
      ],
    },
    {
      id: 'doing',
      title: 'In progress',
      cards: [{ id: 3, title: 'Set up CI', priority: 'high' }],
    },
    {
      id: 'done',
      title: 'Done',
      cards: [],
    },
  ],
};
