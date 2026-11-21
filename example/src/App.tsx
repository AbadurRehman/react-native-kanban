import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { KanbanBoard } from 'react-native-kanban';

/**
 * Phase 0 setup check.
 *
 * Confirms the example app resolves the library from source and that
 * Reanimated 4 + Worklets + Gesture Handler run on the UI thread.
 * The real <Board /> replaces this screen in Phase 1.
 */

const board: KanbanBoard = {
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [
        { id: 1, title: 'Theme tokens' },
        { id: 2, title: 'Render props' },
      ],
    },
    { id: 'doing', title: 'In progress', cards: [{ id: 3, title: 'CI' }] },
    { id: 'done', title: 'Done', cards: [] },
  ],
};

function DraggableCard() {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);

  const pan = Gesture.Pan()
    .onBegin(() => {
      scale.value = withSpring(1.05);
    })
    .onChange((event) => {
      x.value += event.changeX;
      y.value += event.changeY;
    })
    .onFinalize(() => {
      x.value = withSpring(0);
      y.value = withSpring(0);
      scale.value = withSpring(1);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, styles.dragCard, style]}>
        <Text style={styles.cardText}>Drag me — Reanimated + RNGH OK</Text>
      </Animated.View>
    </GestureDetector>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>react-native-kanban</Text>
        <Text style={styles.subtitle}>
          Phase 0 setup check · React Native CLI · {Platform.OS}
        </Text>
      </View>

      <DraggableCard />

      <ScrollView horizontal contentContainerStyle={styles.board}>
        {board.columns.map((column) => (
          <View key={column.id} style={styles.column}>
            <Text style={styles.columnTitle}>
              {column.title} ({column.cards.length})
            </Text>
            {column.cards.map((card) => (
              <View key={card.id} style={styles.card}>
                <Text style={styles.cardText}>{card.title}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5F7' },
  header: { paddingTop: 64, paddingHorizontal: 16, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#172B4D' },
  subtitle: { marginTop: 4, color: '#5E6C84' },
  board: { padding: 16, gap: 12 },
  column: {
    width: 240,
    padding: 12,
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#EBECF0',
  },
  columnTitle: { fontWeight: '600', color: '#172B4D' },
  card: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dragCard: { marginHorizontal: 16, backgroundColor: '#DEEBFF' },
  cardText: { color: '#172B4D' },
});
