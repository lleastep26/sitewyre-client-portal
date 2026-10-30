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

type Message = {
  id: string;
  contact_id: string;
  channel: string;
  direction: string;
  body: string | null;
  created_at: string;
  contacts?: { name: string } | { name: string }[] | null;
};

export function OwnerInboxScreen({ clientId }: { clientId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("messages")
      .select("id, contact_id, channel, direction, body, created_at, contacts(name)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (qErr) setError(qErr.message);
    else setMessages((data as unknown as Message[]) ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
        <Pressable onPress={() => void load()}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color="#b5673b" /> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? <Text style={styles.muted}>No messages yet.</Text> : null
        }
        renderItem={({ item }) => {
          const name =
            (Array.isArray(item.contacts)
              ? item.contacts[0]?.name
              : item.contacts?.name) ?? "Contact";
          const inbound = item.direction === "inbound";
          return (
            <View style={[styles.card, inbound ? styles.inbound : null]}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{name}</Text>
                <Text style={styles.meta}>
                  {item.channel} · {item.direction}
                </Text>
              </View>
              <Text style={styles.body} numberOfLines={4}>
                {item.body ?? "(no body)"}
              </Text>
              <Text style={styles.meta}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          );
        }}
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
  inbound: { borderColor: "#b5673b" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#2b241c", flex: 1 },
  body: { color: "#2b241c", fontSize: 13 },
  meta: { color: "#9a8f82", fontSize: 11 },
});
