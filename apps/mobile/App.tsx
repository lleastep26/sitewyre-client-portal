import { useEffect, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { LoginScreen } from "./src/screens/LoginScreen";
import { CrewTodayScreen } from "./src/screens/CrewTodayScreen";
import { getSessionUserId, supabaseConfigured } from "./src/lib/supabase";

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supabaseConfigured) {
        if (mounted) setBooting(false);
        return;
      }
      const id = await getSessionUserId();
      if (mounted) {
        setUserId(id);
        setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.inner}>
        <Text style={styles.brand}>Sitewyre</Text>
        {booting ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : !supabaseConfigured ? (
          <Text style={styles.muted}>
            Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in
            apps/mobile/.env
          </Text>
        ) : userId ? (
          <CrewTodayScreen userId={userId} onSignOut={() => setUserId(null)} />
        ) : (
          <LoginScreen onSignedIn={(id) => setUserId(id)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fbf7f2" },
  inner: { flex: 1, padding: 20 },
  brand: {
    fontSize: 28,
    fontWeight: "700",
    color: "#2b241c",
    marginBottom: 16,
  },
  muted: { color: "#6b6358", fontSize: 14 },
});
