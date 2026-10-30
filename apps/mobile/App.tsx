import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LoginScreen } from "./src/screens/LoginScreen";
import { CrewTodayScreen } from "./src/screens/CrewTodayScreen";
import { OwnerShell } from "./src/screens/OwnerShell";
import {
  isOwnerLike,
  loadMembership,
  type MembershipInfo,
} from "./src/lib/membership";
import { getSessionUserId, supabaseConfigured } from "./src/lib/supabase";

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supabaseConfigured) {
        if (mounted) setBooting(false);
        return;
      }
      const id = await getSessionUserId();
      if (!mounted) return;
      if (!id) {
        setUserId(null);
        setMembership(null);
        setBooting(false);
        return;
      }
      setUserId(id);
      const mem = await loadMembership(id);
      if (!mounted) return;
      if (!mem) setError("No membership found for this account.");
      setMembership(mem);
      setBooting(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSignedIn(id: string) {
    setBooting(true);
    setError(null);
    setUserId(id);
    const mem = await loadMembership(id);
    if (!mem) setError("No membership found for this account.");
    setMembership(mem);
    setBooting(false);
  }

  function handleSignOut() {
    setUserId(null);
    setMembership(null);
    setError(null);
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.inner}>
        <Text style={styles.brand}>Sitewyre</Text>
        {booting ? (
          <ActivityIndicator color="#b5673b" />
        ) : !supabaseConfigured ? (
          <Text style={styles.muted}>
            Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in
            apps/mobile/.env
          </Text>
        ) : error && userId ? (
          <Text style={styles.err}>{error}</Text>
        ) : userId && membership ? (
          isOwnerLike(membership.role) ? (
            <OwnerShell
              userId={userId}
              membership={membership}
              onSignOut={handleSignOut}
            />
          ) : (
            <CrewTodayScreen userId={userId} onSignOut={handleSignOut} />
          )
        ) : (
          <LoginScreen onSignedIn={(id) => void handleSignedIn(id)} />
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
  err: { color: "#b42318", fontSize: 14 },
});
