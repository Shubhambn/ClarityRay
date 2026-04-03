import { getToken } from '@/utils/auth';
import type {
  AnalysisJob,
  AnalysisUploadResponse,
  AuthResponse,
  HistoryResponse,
  UserPreferences,
  UserProfile
} from '@/utils/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Request failed.');
  }

  return payload as T;
}

export const api = {
  signup(payload: { name: string; email: string; password: string }) {
    return request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  login(payload: { email: string; password: string }) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  uploadAnalysis(file: File) {
    const formData = new FormData();
    formData.append('scan', file);

    return request<AnalysisUploadResponse>('/analysis/upload', {
      method: 'POST',
      body: formData
    });
  },

  getAnalysis(id: string) {
    return request<AnalysisJob>(`/analysis/${id}`);
  },

  getHistory() {
    return request<HistoryResponse>('/analysis/history');
  },

  getProfile() {
    return request<UserProfile>('/user/profile');
  },

  updateSettings(payload: { name?: string; preferences?: Partial<UserPreferences> }) {
    return request<UserProfile>('/user/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }
};
