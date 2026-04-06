/** Base URL for backend API calls, configurable via environment variable. */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ModelVersion {
  id: string;
  version: string;
  onnx_url: string;
  clarity_url: string;
  file_size_mb: number | null;
  is_current: boolean;
}

export interface ModelSummary {
  id: string;
  slug: string;
  name: string;
  bodypart: string;
  modality: string;
  status: string;
  published_at: string | null;
  current_version: ModelVersion | null;
}

export interface ModelDetail extends ModelSummary {
  validation: {
    passed: boolean;
    ran_at: string | null;
    checks: Array<{ name: string; passed: boolean; message: string }>;
  } | null;
}

export interface ModelsResponse {
  models: ModelSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  error: string;
  slug?: string;
  status_code: number;
}

export class BackendError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/**
 * Type guard for plain object records.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Returns a string value with fallback.
 */
function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Returns a nullable string, converting non-strings to null.
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Returns a number value with fallback.
 */
function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Returns a nullable number, converting non-numbers to null.
 */
function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Returns a boolean value with fallback.
 */
function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Maps unknown payload into a typed ModelVersion.
 */
function mapModelVersion(value: unknown): ModelVersion {
  if (!isRecord(value)) {
    return {
      id: "",
      version: "",
      onnx_url: "",
      clarity_url: "",
      file_size_mb: null,
      is_current: false,
    };
  }

  return {
    id: readString(value.id),
    version: readString(value.version),
    onnx_url: readString(value.onnx_url),
    clarity_url: readString(value.clarity_url),
    file_size_mb: readNullableNumber(value.file_size_mb),
    is_current: value.is_current === undefined ? true : readBoolean(value.is_current), // ✅ FIX
  };
}

function mapModelSummary(value: unknown): ModelSummary {
  if (!isRecord(value)) {
    return {
      id: "",
      slug: "",
      name: "",
      bodypart: "",
      modality: "",
      status: "",
      published_at: null,
      current_version: null,
    };
  }

  return {
    id: readString(value.id),
    slug: readString(value.slug),
    name: readString(value.name),
    bodypart: readString(value.bodypart) || 'other', // ✅ FIX
    modality: readString(value.modality) || 'other', // ✅ FIX
    status: readString(value.status),
    published_at: readNullableString(value.published_at),
    current_version:
      value.current_version === null || value.current_version === undefined
        ? null
        : mapModelVersion(value.current_version),
  };
}

/**
 * Maps unknown payload into a typed ModelDetail.
 */
function mapModelDetail(value: unknown): ModelDetail {
  const summary = mapModelSummary(value);

  if (!isRecord(value)) {
    return { ...summary, validation: null };
  }

  const validationRaw = value.validation;
  if (!isRecord(validationRaw)) {
    return { ...summary, validation: null };
  }

  const checksRaw = validationRaw.checks;
  const checks = Array.isArray(checksRaw)
    ? checksRaw
        .filter((item) => isRecord(item))
        .map((item) => ({
          name: readString(item.name),
          passed: readBoolean(item.passed),
          message: readString(item.message),
        }))
    : [];

  return {
    ...summary,
    validation: {
      passed: readBoolean(validationRaw.passed),
      ran_at: readNullableString(validationRaw.ran_at),
      checks,
    },
  };
}

/**
 * Maps unknown payload into a typed ModelsResponse.
 */
function mapModelsResponse(value: unknown): ModelsResponse {
  if (!isRecord(value)) {
    return {
      models: [],
      total: 0,
      page: 1,
      limit: 0,
    };
  }

  const modelsRaw = value.models;
  const models = Array.isArray(modelsRaw)
    ? modelsRaw.map((item) => mapModelSummary(item))
    : [];

  return {
    models,
    total: readNumber(value.total),
    page: readNumber(value.page, 1),
    limit: readNumber(value.limit),
  };
}

/**
 * Maps unknown payload into model status response.
 */
function mapModelStatus(
  value: unknown,
  fallbackSlug: string
): { slug: string; status: string; validation_passed: boolean } {
  if (!isRecord(value)) {
    return {
      slug: fallbackSlug,
      status: "unknown",
      validation_passed: false,
    };
  }

  return {
    slug: readString(value.slug, fallbackSlug),
    status: readString(value.status, "unknown"),
    validation_passed: readBoolean(value.validation_passed),
  };
}

/**
 * Attempts to parse API error payload.
 */
async function parseApiError(response: Response): Promise<ApiError | null> {
  try {
    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return null;
    }

    if (typeof payload.error !== "string" || typeof payload.status_code !== "number") {
      return null;
    }

    const result: ApiError = {
      error: payload.error,
      status_code: payload.status_code,
    };

    if (typeof payload.slug === "string") {
      result.slug = payload.slug;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Converts a failed HTTP response into a BackendError.
 */
async function toBackendError(response: Response, endpoint: string): Promise<BackendError> {
  const apiError = await parseApiError(response);

  if (apiError) {
    return new BackendError(apiError.error, apiError.status_code, endpoint);
  }

  return new BackendError(
    `Request failed with status ${response.status}`,
    response.status,
    endpoint
  );
}

/**
 * Performs a fetch call with timeout and normalized backend/network errors.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const incomingSignal = options.signal;
  const abortForwarder = (): void => controller.abort();

  if (incomingSignal) {
    if (incomingSignal.aborted) {
      controller.abort();
    } else {
      incomingSignal.addEventListener("abort", abortForwarder, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BackendError("Request timed out", 408, url);
    }

    throw new BackendError("Cannot reach backend API", 0, url);
  } finally {
    clearTimeout(timeoutId);
    if (incomingSignal) {
      incomingSignal.removeEventListener("abort", abortForwarder);
    }
  }
}

/**
 * Fetches paginated model summaries with optional bodypart/modality filters.
 * Returns an empty list if the backend responds with HTTP 404.
 */
export async function fetchModels(filters?: {
  bodypart?: string;
  modality?: string;
}): Promise<ModelsResponse> {
  const params = new URLSearchParams();

  if (filters?.bodypart) {
    params.set("bodypart", filters.bodypart);
  }
  if (filters?.modality) {
    params.set("modality", filters.modality);
  }

  const endpoint = `${API_BASE}/models${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetchWithTimeout(endpoint);

  if (response.status === 404) {
    return {
      models: [],
      total: 0,
      page: 1,
      limit: 0,
    };
  }

  if (!response.ok) {
    throw await toBackendError(response, endpoint);
  }

  const payload: unknown = await response.json();
  return mapModelsResponse(payload);
}

/**
 * Fetches a model by slug.
 * Throws BackendError with status code 404 when the slug is not found.
 */
export async function fetchModelBySlug(slug: string): Promise<ModelDetail> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    throw new BackendError("Model slug is required", 400, "/models/:slug");
  }

  const endpoint = `${API_BASE}/models/${encodeURIComponent(normalizedSlug)}`;
  const response = await fetchWithTimeout(endpoint);

  if (!response.ok) {
    throw await toBackendError(response, endpoint);
  }

  const payload: unknown = await response.json();
  return mapModelDetail(payload);
}

/**
 * Fetches model publication and validation status by slug.
 */
export async function fetchModelStatus(
  slug: string
): Promise<{ slug: string; status: string; validation_passed: boolean }> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    throw new BackendError("Model slug is required", 400, "/models/:slug/status");
  }

  const endpoint = `${API_BASE}/models/${encodeURIComponent(normalizedSlug)}/status`;
  const response = await fetchWithTimeout(endpoint);

  if (!response.ok) {
    throw await toBackendError(response, endpoint);
  }

  const payload: unknown = await response.json();
  return mapModelStatus(payload, normalizedSlug);
}

/**
 * Checks backend health and model count.
 * Never throws; on any failure returns an offline-safe fallback.
 */
export async function checkBackendHealth(): Promise<{ ok: boolean; modelsCount: number }> {
  const endpoint = `${API_BASE}/health`;

  try {
    const response = await fetchWithTimeout(endpoint);
    if (!response.ok) {
      return { ok: false, modelsCount: 0 };
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return { ok: false, modelsCount: 0 };
    }

    const ok = readBoolean(payload.ok);
    const modelsCount =
      typeof payload.modelsCount === "number" && Number.isFinite(payload.modelsCount)
        ? payload.modelsCount
        : typeof payload.models_count === "number" && Number.isFinite(payload.models_count)
          ? payload.models_count
          : 0;

    return { ok, modelsCount };
  } catch {
    return { ok: false, modelsCount: 0 };
  }
}
