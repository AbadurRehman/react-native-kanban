import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { KanbanColorScheme } from 'react-native-kanban';
import { KanbanDemo } from '../../example-shared/KanbanDemo';

export default function App() {
  const [scheme, setScheme] = useState<KanbanColorScheme>('light');

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <KanbanDemo
        platformLabel={Platform.OS === 'web' ? 'Web' : 'Expo'}
        onSchemeChange={setScheme}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
