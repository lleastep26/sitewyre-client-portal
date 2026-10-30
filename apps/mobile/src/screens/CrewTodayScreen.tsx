import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { signOut, supabase } from "../lib/supabase";

type Job = {
  id: string;
  address: string | null;
  status: string;
  scheduled_start: string | null;
  notes: string | null;
};

export function CrewTodayScreen({
  userId,
  onSignOut,
}: {
  userId: string;
  onSignOut: () => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error: qErr } = await supabase
      .from("jobs")
      .select("id, address, status, scheduled_start, notes")
      .contains("assignee_ids", [userId])
      .gte("scheduled_start", start.toISOString())
      .lte("scheduled_start", end.toISOString())
      .order("scheduled_start");

    if (qErr) setError(qErr.message);
    else setJobs((data as Job[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // Initial + user change load; load is stable per userId.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
  }, [load]);

  async function handleSignOut() {
    await signOut();
    onSignOut();
  }

  async function setStatus(jobId: string, status: string) {
    if (!supabase) return;
    await supabase.from("jobs").update({ status }).eq("id", jobId);
    await load();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <Pressable onPress={handleSignOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color="#b5673b" /> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.muted}>No jobs assigned today.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.address ?? "Job"}</Text>
            <Text style={styles.muted}>{item.status}</Text>
            {item.notes ? <Text style={styles.muted}>{item.notes}</Text> : null}
            {item.address ? (
              <Pressable
                onPress={() =>
                  void Linking.openURL(
                    `https://maps.google.com/?q=${encodeURIComponent(item.address!)}`,
                  )
                }
              >
                <Text style={styles.link}>Open in Maps</Text>
              </Pressable>
            ) : null}
            <View style={styles.row}>
              <Pressable
                style={styles.smallBtn}
                onPress={() => void setStatus(item.id, "en_route")}
              >
                <Text style={styles.smallBtnText}>Start route</Text>
              </Pressable>
              <Pressable
                style={styles.smallBtn}
                onPress={() => void setStatus(item.id, "complete")}
              >
                <Text style={styles.smallBtnText}>Complete</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#2b241c" },
  link: { color: "#b5673b", fontSize: 14 },
  muted: { color: "#6b6358", fontSize: 13 },
  err: { color: "#b42318", fontSize: 13 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e8dccb",
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#2b241c" },
  row: { flexDirection: "row", gap: 8, marginTop: 6 },
  smallBtn: {
    backgroundColor: "#f3ebe1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallBtnText: { color: "#2b241c", fontSize: 13, fontWeight: "600" },
});
