export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api';

export function normalizeApiUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid server address ending in /api.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/+$/, '') !== '/api'
  ) {
    throw new Error('Use your dojo server address, for example http://192.168.1.20:3000/api.');
  }
  return `${url.origin}/api`;
}

export type Member = {
  id: string;
  fullName: string;
  phone: string | null;
  beltRank: string;
  joinedOn: string;
  active: boolean;
};

export type AttendanceRecord = {
  id: string;
  memberId: string;
  fullName: string;
  attendanceDate: string;
  recordedAt: string;
};

export type FeeRecord = {
  id: string;
  memberId: string;
  fullName: string;
  amount: string | number;
  feePeriod: string;
  paidOn: string;
  paymentMethod: string;
  note: string | null;
};

export type Dashboard = {
  activeMembers: number;
  attendanceToday: number;
  feesThisMonth: number;
};

type ApiError = { error?: string };

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(
  baseUrl: string,
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const result = (await response.json()) as ApiError;
    throw new ApiRequestError(result.error ?? `Request failed (${response.status}).`, response.status);
  }
  return (await response.json()) as T;
}

export async function signIn(baseUrl: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const result = (await response.json()) as ApiError & { token?: string };
  if (!response.ok || !result.token) {
    throw new Error(result.error ?? 'Could not sign in.');
  }
  return result.token;
}

export function createApi(baseUrl: string) {
  return {
    dashboard: (token: string, date: string) => request<Dashboard>(baseUrl, `/dashboard?date=${date}`, token),
    members: (token: string) => request<Member[]>(baseUrl, '/members', token),
    attendance: (token: string, date: string) => request<AttendanceRecord[]>(baseUrl, `/attendance?date=${date}`, token),
    fees: (token: string) => request<FeeRecord[]>(baseUrl, '/fees', token),
    addMember: (token: string, member: { fullName: string; phone?: string; beltRank: string }) =>
      request<Member>(baseUrl, '/members', token, { method: 'POST', body: JSON.stringify(member) }),
    markAttendance: (token: string, memberId: string, attendanceDate: string) =>
      request<AttendanceRecord>(baseUrl, '/attendance', token, {
        method: 'POST',
        body: JSON.stringify({ memberId, attendanceDate }),
      }),
    addFee: (
      token: string,
      fee: {
        memberId: string;
        amount: number;
        feePeriod: string;
        paymentMethod: 'cash' | 'card' | 'bank transfer' | 'other';
        paidOn: string;
      },
    ) => request<FeeRecord>(baseUrl, '/fees', token, { method: 'POST', body: JSON.stringify(fee) }),
    archiveMember: (token: string, memberId: string) =>
      request<{ id: string; active: boolean }>(baseUrl, `/members/${memberId}/archive`, token, { method: 'PATCH' }),
  };
}
