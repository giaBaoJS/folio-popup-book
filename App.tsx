import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stage } from './src/ui/Stage';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.root}>
        <StatusBar hidden />
        <Stage />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#120d1f' },
});
