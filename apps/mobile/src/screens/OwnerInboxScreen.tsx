import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { sendInboxSms } from "../lib/api";
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

export function OwnerInboxScreen({
  clientId,
  focusContactId,
  onFocusConsumed,
}: {
  clientId: string;
  focusContactId?: string | null;
  onFocusConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyContactId, setReplyContactId] = useState<string | null>(null);
  const [replyName, setReplyName] = useState<string>("");
  const [replyPhone, setReplyPhone] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    let query = supabase
      .from("messages")
      .select(
        "id, contact_id, channel, direction, body, created_at, contacts(name)",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (focusContactId) {
      query = query.eq("contact_id", focusContactId);
    }
    const { data, error: qErr } = await query;
    if (qErr) setError(qErr.message);
    else setMessages((data as unknown as Message[]) ?? []);
    setLoading(false);
  }, [clientId, focusContactId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel(`messages:${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [clientId, load]);

  const openReplyForContact = useCallback(
    async (contactId: string, nameHint?: string) => {
      setReplyContactId(contactId);
      setReplyName(nameHint ?? "Contact");
      setDraft("");
      setError(null);
      if (!supabase) return;
      const { data } = await supabase
        .from("contacts")
        .select("name, phones")
        .eq("id", contactId)
        .maybeSingle();
      if (data?.name) setReplyName(String(data.name));
      setReplyPhone(data?.phones?.[0] ? String(data.phones[0]) : null);
    },
    [],
  );

  useEffect(() => {
    if (!focusContactId) return;
    void openReplyForContact(focusContactId).then(() => onFocusConsumed?.());
  }, [focusContactId, openReplyForContact, onFocusConsumed]);

  function contactName(item: Message) {
    return (
      (Array.isArray(item.contacts)
        ? item.contacts[0]?.name
        : item.contacts?.name) ?? "Contact"
    );
  }

  async function openReply(item: Message) {
    await openReplyForContact(item.contact_id, contactName(item));
  }

  async function sendReply() {
    if (!replyContactId || !draft.trim()) return;
    setSending(true);
    setError(null);
    const result = await sendInboxSms({
      contactId: replyContactId,
      body: draft.trim(),
      phone: replyPhone,
    });
    setSending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setDraft("");
    setReplyContactId(null);
    await load();
  }

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

      {replyContactId ? (
        <View style={styles.composer}>
          <Text style={styles.composerTitle}>Reply to {replyName}</Text>
          {replyPhone ? (
            <Text style={styles.muted}>{replyPhone}</Text>
          ) : (
            <Text style={styles.err}>No phone on contact</Text>
          )}
          <TextInput
            style={styles.input}
            multiline
            placeholder="SMS reply…"
            value={draft}
            onChangeText={setDraft}
          />
          <View style={styles.composerRow}>
            <Pressable
              onPress={() => {
                setReplyContactId(null);
                setDraft("");
              }}
            >
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.sendBtn,
                (!draft.trim() || sending) && styles.sendDisabled,
              ]}
              disabled={!draft.trim() || sending || !replyPhone}
              onPress={() => void sendReply()}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendText}>Send SMS</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? <Text style={styles.muted}>No messages yet.</Text> : null
        }
        renderItem={({ item }) => {
          const inbound = item.direction === "inbound";
          return (
            <Pressable
              style={[styles.card, inbound ? styles.inbound : null]}
              onPress={() => void openReply(item)}
            >
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{contactName(item)}</Text>
                <Text style={styles.meta}>
                  {item.channel} · {item.direction}
                </Text>
              </View>
              <Text style={styles.body} numberOfLines={4}>
                {item.body ?? "(no body)"}
              </Text>
              <Text style={styles.meta}>
                {new Date(item.created_at).toLocaleString()} · Tap to reply
              </Text>
            </Pressable>
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
  composer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b5673b",
    padding: 12,
    gap: 8,
  },
  composerTitle: { fontSize: 15, fontWeight: "600", color: "#2b241c" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd2c4",
    borderRadius: 8,
    padding: 10,
    minHeight: 72,
    textAlignVertical: "top",
    backgroundColor: "#fbf7f2",
    color: "#2b241c",
  },
  composerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sendBtn: {
    backgroundColor: "#b5673b",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 96,
    alignItems: "center",
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontWeight: "600", fontSize: 13 },
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
