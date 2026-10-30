import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { LoginScreen } from "./src/screens/LoginScreen";
import { CrewTodayScreen } from "./src/screens/CrewTodayScreen";
import { OwnerShell } from "./src/screens/OwnerShell";
import {
  isOwnerLike,
  loadMembership,
  type MembershipInfo,
} from "./src/lib/membership";
import {
  completeAuthFromUrl,
  getSessionUserId,
  supabase,
  supabaseConfigured,
} from "./src/lib/supabase";

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function establishSession(id: string) {
    setUserId(id);
    const mem = await loadMembership(id);
    if (!mem) setError("No membership found for this account.");
    else setError(null);
    setMembership(mem);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supabaseConfigured) {
        if (mounted) setBooting(false);
        return;
      }

      const initialUrl = await Linking.getInitialURL();
      if (initialUrl?.includes("auth/callback") || initialUrl?.includes("access_token") || initialUrl?.includes("code=")) {
        const result = await completeAuthFromUrl(initialUrl);
        if (!mounted) return;
        if (result.error) setError(result.error);
        if (result.userId) {
          await establishSession(result.userId);
          setBooting(false);
          return;
        }
      }

      const id = await getSessionUserId();
      if (!mounted) return;
      if (!id) {
        setUserId(null);
        setMembership(null);
        setBooting(false);
        return;
      }
      await establishSession(id);
      if (mounted) setBooting(false);
    })();

    const sub = Linking.addEventListener("url", ({ url }) => {
      void (async () => {
        if (!url.includes("auth") && !url.includes("access_token") && !url.includes("code=")) {
          return;
        }
        const result = await completeAuthFromUrl(url);
        if (result.error) setError(result.error);
        if (result.userId) await establishSession(result.userId);
      })();
    });

    const authSub = supabase?.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      if (!id) {
        setUserId(null);
        setMembership(null);
        return;
      }
      void establishSession(id);
    });

    return () => {
      mounted = false;
      sub.remove();
      authSub?.data.subscription.unsubscribe();
    };
  }, []);

  async function handleSignedIn(id: string) {
    setBooting(true);
    setError(null);
    await establishSession(id);
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
