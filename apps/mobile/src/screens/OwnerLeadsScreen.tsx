import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

type Lead = {
  id: string;
  name: string;
  phone: string;
  message: string;
  first_response_at: string | null;
  created_at: string;
};

export function OwnerLeadsScreen({ clientId }: { clientId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("leads")
      .select("id, name, phone, message, first_response_at, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (qErr) setError(qErr.message);
    else setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Leads</Text>
        <Pressable onPress={() => void load()}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color="#b5673b" /> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <FlatList
        data={leads}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? <Text style={styles.muted}>No leads yet.</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {!item.first_response_at ? (
                <Text style={styles.badge}>Needs reply</Text>
              ) : null}
            </View>
            <Text style={styles.muted}>{item.phone}</Text>
            {item.message ? (
              <Text style={styles.body} numberOfLines={3}>
                {item.message}
              </Text>
            ) : null}
            <Text style={styles.meta}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
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
    gap: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#2b241c", flex: 1 },
  badge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#b42318",
    backgroundColor: "#fee4e2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  body: { color: "#2b241c", fontSize: 13, marginTop: 2 },
  meta: { color: "#9a8f82", fontSize: 11, marginTop: 4 },
});
