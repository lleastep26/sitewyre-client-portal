import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MembershipInfo } from "../lib/membership";
import { signOut } from "../lib/supabase";
import { CrewTodayScreen } from "./CrewTodayScreen";
import { OwnerInboxScreen } from "./OwnerInboxScreen";
import { OwnerLeadsScreen } from "./OwnerLeadsScreen";

type Tab = "leads" | "inbox" | "today";

export function OwnerShell({
  userId,
  membership,
  onSignOut,
}: {
  userId: string;
  membership: MembershipInfo;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>("leads");
  const [inboxFocusContactId, setInboxFocusContactId] = useState<string | null>(
    null,
  );

  async function handleSignOut() {
    await signOut();
    onSignOut();
  }

  const openInboxForContact = useCallback((contactId: string) => {
    setInboxFocusContactId(contactId);
    setTab("inbox");
  }, []);

  const clearInboxFocus = useCallback(() => {
    setInboxFocusContactId(null);
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View>
          <Text style={styles.biz}>
            {membership.businessName ?? "Your business"}
          </Text>
          <Text style={styles.role}>{membership.role.replace("_", " ")}</Text>
        </View>
        <Pressable onPress={() => void handleSignOut()}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(
          [
            ["leads", "Leads"],
            ["inbox", "Inbox"],
            ["today", "Today"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => {
              if (id !== "inbox") setInboxFocusContactId(null);
              setTab(id);
            }}
            style={styles.tabBtn}
          >
            <Text style={tab === id ? styles.tabOn : styles.tab}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {tab === "leads" ? (
          <OwnerLeadsScreen
            clientId={membership.clientId}
            onReply={openInboxForContact}
          />
        ) : null}
        {tab === "inbox" ? (
          <OwnerInboxScreen
            clientId={membership.clientId}
            focusContactId={inboxFocusContactId}
            onFocusConsumed={clearInboxFocus}
          />
        ) : null}
        {tab === "today" ? (
          <CrewTodayScreen
            userId={userId}
            onSignOut={onSignOut}
            embedded
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 12 },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  biz: { fontSize: 18, fontWeight: "700", color: "#2b241c" },
  role: { color: "#6b6358", fontSize: 12, marginTop: 2 },
  link: { color: "#b5673b", fontSize: 14 },
  tabs: { flexDirection: "row", gap: 16 },
  tabBtn: { paddingVertical: 4 },
  tab: { color: "#9a8f82", fontSize: 15 },
  tabOn: { color: "#b5673b", fontSize: 15, fontWeight: "700" },
  body: { flex: 1 },
});
