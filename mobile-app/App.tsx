import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import RepartoScreen from './src/screens/RepartoScreen';
import LoginScreen from './src/screens/LoginScreen';
import { initDatabase, getDatabase } from './src/database/schema';

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    initDatabase()
      .then(async () => {
        // Check existing session
        try {
          const db = await getDatabase();
          const session = await db.getAllAsync('SELECT * FROM sesion_usuario LIMIT 1');
          if (session.length > 0) {
            setUser(session[0]);
          }
        } catch (e) {
          console.log('No session found:', e);
        }
        setDbReady(true);
      })
      .catch((e) => console.error('Error initializing DB:', e));
  }, []);

  const handleLogout = async () => {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM sesion_usuario');
    } catch (e) {
      console.error(e);
    }
    setUser(null);
  };

  if (!dbReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={styles.loadingText}>Iniciando Agua Móvil - EPS Moyobamba...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {user ? (
        <RepartoScreen user={user} onLogout={handleLogout} />
      ) : (
        <LoginScreen onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 44,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
});
