import { useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { KanbanColorScheme } from 'react-native-kanban';
import { KanbanDemo } from '../../example-shared/KanbanDemo';

export default function App() {
  const [scheme, setScheme] = useState<KanbanColorScheme>('light');

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <KanbanDemo platformLabel="React Native CLI" onSchemeChange={setScheme} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
