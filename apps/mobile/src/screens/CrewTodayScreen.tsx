import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { signOut, supabase } from "../lib/supabase";

type ChecklistItem = { id: string; label: string; done: boolean };

type Job = {
  id: string;
  address: string | null;
  status: string;
  scheduled_start: string | null;
  notes: string | null;
  checklist: ChecklistItem[] | null;
  photos: string[] | null;
  client_id: string;
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
  const [busyId, setBusyId] = useState<string | null>(null);

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
      .select(
        "id, address, status, scheduled_start, notes, checklist, photos, client_id",
      )
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
  }, [load]);

  async function handleSignOut() {
    await signOut();
    onSignOut();
  }

  async function setStatus(jobId: string, status: string) {
    if (!supabase) return;
    setBusyId(jobId);
    await supabase.from("jobs").update({ status }).eq("id", jobId);
    setBusyId(null);
    await load();
  }

  async function toggleChecklist(job: Job, itemId: string) {
    if (!supabase) return;
    const checklist = (job.checklist ?? []).map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item,
    );
    setBusyId(job.id);
    await supabase.from("jobs").update({ checklist }).eq("id", job.id);
    setBusyId(null);
    await load();
  }

  async function addPhoto(job: Job) {
    if (!supabase) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission required");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      base64: false,
    });
    if (shot.canceled || !shot.assets?.[0]) return;

    const asset = shot.assets[0];
    setBusyId(job.id);
    try {
      const res = await fetch(asset.uri);
      const blob = await res.blob();
      const ext = asset.mimeType?.includes("png") ? "png" : "jpg";
      const path = `${job.client_id}/${job.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("job-photos")
        .upload(path, blob, {
          contentType: asset.mimeType ?? "image/jpeg",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
      const photos = [...(job.photos ?? []), pub.publicUrl];
      await supabase.from("jobs").update({ photos }).eq("id", job.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyId(null);
    }
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

            {(item.checklist ?? []).map((c) => (
              <Pressable
                key={c.id}
                style={styles.checkRow}
                disabled={busyId === item.id}
                onPress={() => void toggleChecklist(item, c.id)}
              >
                <Text style={styles.checkBox}>{c.done ? "✓" : "○"}</Text>
                <Text style={styles.checkLabel}>{c.label}</Text>
              </Pressable>
            ))}

            <View style={styles.photoRow}>
              {(item.photos ?? []).slice(0, 4).map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.thumb} />
              ))}
            </View>

            <View style={styles.row}>
              <Pressable
                style={styles.smallBtn}
                disabled={busyId === item.id}
                onPress={() => void addPhoto(item)}
              >
                <Text style={styles.smallBtnText}>Add photo</Text>
              </Pressable>
              <Pressable
                style={styles.smallBtn}
                disabled={busyId === item.id}
                onPress={() => void setStatus(item.id, "en_route")}
              >
                <Text style={styles.smallBtnText}>Start route</Text>
              </Pressable>
              <Pressable
                style={styles.smallBtn}
                disabled={busyId === item.id}
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
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  checkBox: { width: 18, color: "#b5673b", fontSize: 14 },
  checkLabel: { color: "#2b241c", fontSize: 13 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#eee" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  smallBtn: {
    backgroundColor: "#f3ebe1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallBtnText: { color: "#2b241c", fontSize: 13, fontWeight: "600" },
});
