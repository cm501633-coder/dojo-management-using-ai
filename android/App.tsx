import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ApiRequestError,
  createApi,
  DEFAULT_API_URL,
  normalizeApiUrl,
  type AttendanceRecord,
  type Dashboard,
  type FeeRecord,
  type Member,
  signIn,
} from './src/api';

type Page = 'dashboard' | 'members' | 'attendance' | 'fees' | 'add-member' | 'add-fee';
const TOKEN_KEY = 'dojo-auth-token';
const API_URL_KEY = 'dojo-api-url';

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function ActionButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'words',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'numeric' | 'decimal-pad';
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [page, setPage] = useState<Page>('dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberBelt, setMemberBelt] = useState('White belt');
  const [feeMember, setFeeMember] = useState<string | null>(null);
  const [feeAmount, setFeeAmount] = useState('');
  const [feePeriod, setFeePeriod] = useState(localDate().slice(0, 7));
  const [feeMethod, setFeeMethod] = useState<'cash' | 'card' | 'bank transfer' | 'other'>('cash');

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(API_URL_KEY),
    ])
      .then(([savedToken, savedApiUrl]) => {
        setToken(savedToken);
        if (savedApiUrl) setApiUrl(savedApiUrl);
      })
      .catch(() => Alert.alert('Storage unavailable', 'The secure sign-in session could not be read.'))
      .finally(() => setStarting(false));
  }, []);

  async function refreshData(currentToken = token) {
    if (!currentToken) return;
    setLoading(true);
    try {
      const client = createApi(apiUrl);
      const today = localDate();
      const [summary, memberRows, attendanceRows, feeRows] = await Promise.all([
        client.dashboard(currentToken, today),
        client.members(currentToken),
        client.attendance(currentToken, today),
        client.fees(currentToken),
      ]);
      setDashboard(summary);
      setMembers(memberRows);
      setAttendance(attendanceRows);
      setFees(feeRows);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setToken(null);
      }
      Alert.alert('Could not load dojo records', error instanceof Error ? error.message : 'Check the server connection.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void refreshData(token);
  }, [token]);

  async function handleSignIn() {
    setLoading(true);
    try {
      const serverUrl = normalizeApiUrl(apiUrl);
      const newToken = await signIn(serverUrl, username.trim(), password);
      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, newToken),
        SecureStore.setItemAsync(API_URL_KEY, serverUrl),
      ]);
      setApiUrl(serverUrl);
      setToken(newToken);
      setPassword('');
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
      setPage('dashboard');
    } catch {
      Alert.alert('Could not sign out', 'Please try again.');
    }
  }

  async function saveMember() {
    if (!memberName.trim()) {
      Alert.alert('Name required', "Enter the student's name to continue.");
      return;
    }
    if (!token) return;
    setLoading(true);
    try {
      await createApi(apiUrl).addMember(token, {
        fullName: memberName.trim(),
        phone: memberPhone.trim() || undefined,
        beltRank: memberBelt.trim() || 'White belt',
      });
      setMemberName('');
      setMemberPhone('');
      setMemberBelt('White belt');
      setPage('members');
      await refreshData(token);
    } catch (error) {
      Alert.alert('Could not save student', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function markPresent(member: Member) {
    if (!token) return;
    try {
      await createApi(apiUrl).markAttendance(token, member.id, localDate());
      await refreshData(token);
    } catch (error) {
      Alert.alert('Could not record attendance', error instanceof Error ? error.message : 'Try again.');
    }
  }

  function confirmArchive(member: Member) {
    if (!token) return;
    Alert.alert(
      'Archive student?',
      `${member.fullName} will no longer appear in attendance or new payment forms. Existing records will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            void createApi(apiUrl).archiveMember(token, member.id)
              .then(() => refreshData(token))
              .catch((error: unknown) => Alert.alert(
                'Could not archive student',
                error instanceof Error ? error.message : 'Try again.',
              ));
          },
        },
      ],
    );
  }

  async function saveFee() {
    const amount = Number(feeAmount.trim().replace(',', '.'));
    if (!token || !feeMember || !Number.isFinite(amount) || amount <= 0 || !feePeriod.trim()) {
      Alert.alert('Check payment details', 'Choose a student and enter a positive amount and fee period.');
      return;
    }
    setLoading(true);
    try {
      await createApi(apiUrl).addFee(token, {
        memberId: feeMember,
        amount,
        feePeriod: feePeriod.trim(),
        paymentMethod: feeMethod,
        paidOn: localDate(),
      });
      setFeeAmount('');
      setFeeMember(null);
      setPage('fees');
      await refreshData(token);
    } catch (error) {
      Alert.alert('Could not record payment', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (starting) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#126451" /></View>;
  }

  if (!token) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar style="dark" />
        <View style={styles.login}>
          <Text style={styles.brand}>DOJO<Text style={styles.brandAccent}>KEEP</Text></Text>
          <Text style={styles.subtitle}>Your dojo, organized.</Text>
          <Field
            label="Dojo server address"
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="http://192.168.1.20:3000/api"
            autoCapitalize="none"
          />
          <Field label="Username" value={username} onChangeText={setUsername} placeholder="Administrator username" />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <ActionButton label={loading ? 'Signing in…' : 'Sign in'} onPress={() => void handleSignIn()} disabled={loading} />
          <Text style={styles.helper}>Enter the computer's Wi-Fi address. The same address works on every phone.</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const activeMembers = members.filter((member) => member.active);
  const presentIds = new Set(attendance.map((record) => record.memberId));

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>DOJO<Text style={styles.brandAccent}>KEEP</Text></Text>
          <Text style={styles.headerDate}>{localDate()}</Text>
        </View>
        <Pressable onPress={() => void handleSignOut()} accessibilityRole="button">
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.tabs}>
        {(['dashboard', 'members', 'attendance', 'fees'] as const).map((tab) => (
          <Pressable key={tab} onPress={() => setPage(tab)} style={[styles.tab, page === tab && styles.selectedTab]}>
            <Text style={[styles.tabText, page === tab && styles.selectedTabText]}>
              {tab === 'dashboard' ? 'Home' : tab === 'attendance' ? 'Attend.' : tab === 'members' ? 'Students' : 'Fees'}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading && <ActivityIndicator color="#126451" style={styles.loader} />}
        {page === 'dashboard' && (
          <>
            <Text style={styles.title}>Good training starts here.</Text>
            <Text style={styles.muted}>A quick look at your dojo today.</Text>
            <View style={styles.stats}>
              <Stat label="Active students" value={dashboard?.activeMembers ?? '—'} />
              <Stat label="Here today" value={dashboard?.attendanceToday ?? '—'} />
              <Stat label="Fees this month" value={dashboard ? dashboard.feesThisMonth.toFixed(2) : '—'} />
            </View>
            <ActionButton label="Take attendance" onPress={() => setPage('attendance')} />
            <ActionButton label="Record a fee payment" secondary onPress={() => setPage('add-fee')} />
          </>
        )}
        {page === 'members' && (
          <>
            <Text style={styles.title}>Students</Text>
            <ActionButton label="+ Add student" onPress={() => setPage('add-member')} />
            {activeMembers.length === 0 && <Text style={styles.empty}>No students yet. Add your first student.</Text>}
            {members.map((member) => (
              <View key={member.id} style={styles.card}>
                <Text style={styles.cardTitle}>{member.fullName}</Text>
                <Text style={styles.muted}>{member.beltRank}{member.phone ? ` · ${member.phone}` : ''}</Text>
                {!member.active && <Text style={styles.archived}>Archived</Text>}
                {member.active && (
                  <Pressable onPress={() => confirmArchive(member)} accessibilityRole="button">
                    <Text style={styles.archiveAction}>Archive student</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}
        {page === 'add-member' && (
          <>
            <Text style={styles.title}>Add a student</Text>
            <Field label="Full name" value={memberName} onChangeText={setMemberName} placeholder="Student name" />
            <Field label="Phone (optional)" value={memberPhone} onChangeText={setMemberPhone} placeholder="Phone number" keyboardType="phone-pad" />
            <Field label="Belt / rank" value={memberBelt} onChangeText={setMemberBelt} placeholder="White belt" />
            <ActionButton label="Save student" onPress={() => void saveMember()} disabled={loading} />
            <ActionButton label="Cancel" secondary onPress={() => setPage('members')} />
          </>
        )}
        {page === 'attendance' && (
          <>
            <Text style={styles.title}>Attendance</Text>
            <Text style={styles.muted}>Mark each student once for {localDate()}.</Text>
            {activeMembers.length === 0 && <Text style={styles.empty}>Add students before taking attendance.</Text>}
            {activeMembers.map((member) => (
              <View key={member.id} style={styles.attendanceRow}>
                <View style={styles.memberDetails}>
                  <Text style={styles.cardTitle}>{member.fullName}</Text>
                  <Text style={styles.muted}>{member.beltRank}</Text>
                </View>
                <ActionButton
                  label={presentIds.has(member.id) ? 'Present' : 'Mark present'}
                  onPress={() => void markPresent(member)}
                  secondary={presentIds.has(member.id)}
                  disabled={presentIds.has(member.id)}
                />
              </View>
            ))}
            <Text style={styles.sectionTitle}>Recorded today ({attendance.length})</Text>
            {attendance.map((record) => <Text style={styles.listLine} key={record.id}>✓  {record.fullName}</Text>)}
          </>
        )}
        {page === 'fees' && (
          <>
            <Text style={styles.title}>Fee payments</Text>
            <ActionButton label="+ Record payment" onPress={() => setPage('add-fee')} />
            {fees.length === 0 && <Text style={styles.empty}>No fee payments recorded yet.</Text>}
            {fees.map((fee) => (
              <View key={fee.id} style={styles.card}>
                <Text style={styles.cardTitle}>{fee.fullName} · {Number(fee.amount).toFixed(2)}</Text>
                <Text style={styles.muted}>{fee.feePeriod} · Paid {fee.paidOn} · {fee.paymentMethod}</Text>
              </View>
            ))}
          </>
        )}
        {page === 'add-fee' && (
          <>
            <Text style={styles.title}>Record a payment</Text>
            <Text style={styles.fieldLabel}>Choose student</Text>
            {activeMembers.length === 0 && <Text style={styles.empty}>Add a student before recording a payment.</Text>}
            {activeMembers.map((member) => (
              <Pressable
                key={member.id}
                onPress={() => setFeeMember(member.id)}
                style={[styles.choice, feeMember === member.id && styles.selectedChoice]}
              >
                <Text style={[styles.choiceText, feeMember === member.id && styles.selectedChoiceText]}>{member.fullName}</Text>
              </Pressable>
            ))}
            <Field label="Amount" value={feeAmount} onChangeText={setFeeAmount} placeholder="0.00" keyboardType="decimal-pad" />
            <Field label="Fee period" value={feePeriod} onChangeText={setFeePeriod} placeholder="YYYY-MM" />
            <Text style={[styles.fieldLabel, styles.methodLabel]}>Payment method</Text>
            <View style={styles.methods}>
              {(['cash', 'card', 'bank transfer', 'other'] as const).map((method) => (
                <Pressable
                  key={method}
                  onPress={() => setFeeMethod(method)}
                  style={[styles.choice, styles.methodChoice, feeMethod === method && styles.selectedChoice]}
                >
                  <Text style={[styles.choiceText, feeMethod === method && styles.selectedChoiceText]}>{method}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.helper}>Amounts use your dojo's currency; no currency conversion is applied.</Text>
            <ActionButton label="Save payment" onPress={() => void saveFee()} disabled={loading || activeMembers.length === 0} />
            <ActionButton label="Cancel" secondary onPress={() => setPage('fees')} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  login: { flex: 1, justifyContent: 'center', padding: 28 },
  header: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#123a32', fontSize: 22, fontWeight: '900', letterSpacing: 1.2 },
  brandAccent: { color: '#18846b' },
  subtitle: { marginTop: 8, marginBottom: 30, color: '#66736e', fontSize: 16 },
  headerDate: { color: '#66736e', marginTop: 2, fontSize: 12 },
  signOut: { color: '#126451', fontWeight: '700', padding: 10 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e3e9e5' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 13 },
  selectedTab: { borderBottomWidth: 3, borderBottomColor: '#18846b' },
  tabText: { color: '#78827e', fontSize: 12, fontWeight: '600' },
  selectedTabText: { color: '#126451' },
  content: { padding: 20, paddingBottom: 44 },
  title: { color: '#173d34', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  muted: { color: '#73807a', fontSize: 14, lineHeight: 20 },
  stats: { marginVertical: 20, gap: 10 },
  stat: { backgroundColor: '#fff', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#e5ebe7' },
  statValue: { fontSize: 24, color: '#126451', fontWeight: '800' },
  statLabel: { marginTop: 4, color: '#73807a', fontSize: 13 },
  button: { backgroundColor: '#126451', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 11, alignItems: 'center', marginTop: 10 },
  secondaryButton: { backgroundColor: '#e7f1ed' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButtonText: { color: '#126451' },
  disabledButton: { opacity: 0.55 },
  field: { marginTop: 16 },
  fieldLabel: { color: '#33443e', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce5df', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, color: '#173d34' },
  helper: { marginTop: 14, color: '#7d8883', fontSize: 12, lineHeight: 18 },
  loader: { marginVertical: 8 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: '#e5ebe7' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#203a32', marginBottom: 4 },
  archiveAction: { color: '#a55344', fontSize: 13, fontWeight: '600', marginTop: 10 },
  empty: { marginTop: 20, color: '#73807a', fontSize: 14 },
  archived: { color: '#a55344', fontSize: 12, marginTop: 6 },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5ebe7', paddingVertical: 10 },
  memberDetails: { flex: 1, paddingRight: 8 },
  sectionTitle: { color: '#33443e', fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  listLine: { color: '#395149', paddingVertical: 6 },
  choice: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce5df', borderRadius: 9, padding: 12, marginTop: 8 },
  selectedChoice: { backgroundColor: '#e7f1ed', borderColor: '#18846b' },
  choiceText: { color: '#33443e' },
  selectedChoiceText: { color: '#126451', fontWeight: '700' },
  methodLabel: { marginTop: 18 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChoice: { marginTop: 0, paddingVertical: 9, paddingHorizontal: 11 },
});
