export interface UserPreferences {
  showDisclaimerAlways: boolean;
  saveLocalHistory: boolean;
  enableDesktopNotifications: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface AnalysisResult {
  id: string;
  jobId: string;
  userId: string;
  confidence: number;
  explanation: string;
  metadata: {
    model: string;
    modelVersion: string;
    processedAt: string;
    sourceFileName: string;
  };
  disclaimer: string;
  heatmapUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisJob {
  id: string;
  userId: string;
  status: 'processing' | 'completed' | 'failed';
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  resultId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  result?: AnalysisResult | null;
}

export interface AnalysisUploadResponse {
  message: string;
  job: AnalysisJob;
}

export interface HistoryResponse {
  items: AnalysisJob[];
}
