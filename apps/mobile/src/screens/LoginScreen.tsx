import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getSessionUserId,
  signInWithMagicLink,
  signInWithPhoneOtp,
  verifyPhoneOtp,
} from "../lib/supabase";

export function LoginScreen({
  onSignedIn,
}: {
  onSignedIn: (userId: string) => void;
}) {
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitEmail() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await signInWithMagicLink(email.trim());
      if (error) throw error;
      setMessage(
        "Check your email for the magic link. Open it on this device to finish sign-in (sitewyre://auth/callback).",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitPhone() {
    setBusy(true);
    setMessage(null);
    try {
      if (!otpSent) {
        const { error } = await signInWithPhoneOtp(phone.trim());
        if (error) throw error;
        setOtpSent(true);
        setMessage("Enter the SMS code.");
      } else {
        const { error } = await verifyPhoneOtp(phone.trim(), otp.trim());
        if (error) throw error;
        const id = await getSessionUserId();
        if (!id) throw new Error("No session after OTP");
        onSignedIn(id);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Crew / owner login</Text>
      <View style={styles.tabs}>
        <Pressable onPress={() => setMode("email")}>
          <Text style={mode === "email" ? styles.tabOn : styles.tab}>Email</Text>
        </Pressable>
        <Pressable onPress={() => setMode("phone")}>
          <Text style={mode === "phone" ? styles.tabOn : styles.tab}>Phone</Text>
        </Pressable>
      </View>

      {mode === "email" ? (
        <>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@company.com"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable style={styles.btn} onPress={submitEmail} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Send magic link</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            placeholder="+1…"
            value={phone}
            onChangeText={setPhone}
          />
          {otpSent ? (
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="SMS code"
              value={otp}
              onChangeText={setOtp}
            />
          ) : null}
          <Pressable style={styles.btn} onPress={submitPhone} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {otpSent ? "Verify code" : "Send SMS code"}
              </Text>
            )}
          </Pressable>
        </>
      )}

      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: { fontSize: 20, fontWeight: "600", color: "#2b241c" },
  tabs: { flexDirection: "row", gap: 16 },
  tab: { color: "#9a8f82", fontSize: 14 },
  tabOn: { color: "#b5673b", fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd2c4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  btn: {
    backgroundColor: "#b5673b",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
  msg: { color: "#6b6358", fontSize: 13 },
});
