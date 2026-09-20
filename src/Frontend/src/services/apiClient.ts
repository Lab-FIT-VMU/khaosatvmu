interface ApiErrorBody extends Record<string, unknown> {
  errorCode?: string;
  title?: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly errorCode: string;
  /**
   * Thân của lời báo lỗi, ngoài `errorCode`. Hầu hết lỗi không có gì thêm nên để rỗng;
   * phiếu khảo sát công khai dùng chỗ này để gửi kèm hình thức phiếu cho màn chặn.
   */
  public readonly body: Record<string, unknown>;

  constructor(status: number, errorCode: string, body: Record<string, unknown> = {}) {
    super(errorCode);
    this.status = status;
    this.errorCode = errorCode;
    this.body = body;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new ApiError(response.status, body.errorCode ?? 'API_REQUEST_FAILED', body);
  }

  // 204/empty bodies (e.g. NoContent) have nothing to parse
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

let cachedCsrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedCsrfToken) {
    return cachedCsrfToken;
  }

  if (!csrfTokenPromise || forceRefresh) {
    csrfTokenPromise = apiRequest<{ token: string }>('/api/auth/csrf')
      .then((res) => {
        cachedCsrfToken = res.token;
        return res.token;
      })
      .finally(() => {
        csrfTokenPromise = null;
      });
  }

  return csrfTokenPromise;
}

export async function csrfRequest<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const token = await getCsrfToken();
  try {
    return await apiRequest<T>(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ApiError && error.errorCode === 'AUTH_CSRF_INVALID') {
      const freshToken = await getCsrfToken(true);
      return apiRequest<T>(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': freshToken,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    throw error;
  }
}
