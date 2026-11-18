interface ApiErrorBody extends Record<string, unknown> {
  errorCode?: string;
  title?: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly errorCode: string;
  public readonly traceId: string | null;
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
    this.traceId = typeof body.traceId === 'string' && body.traceId.length > 0 ? body.traceId : null;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'API_NETWORK_ERROR');
  }

  if (!response.ok) {
    const raw: unknown = await response.json().catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      return {};
    });
    const body: ApiErrorBody = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as ApiErrorBody : {};
    if (typeof body.traceId !== 'string') body.traceId = response.headers.get('X-Trace-Id');
    const fallback = response.status >= 500 ? 'API_SERVER_ERROR'
      : response.status === 401 ? 'API_UNAUTHORIZED'
        : response.status === 403 ? 'API_FORBIDDEN'
          : response.status === 404 ? 'API_NOT_FOUND'
            : response.status === 409 ? 'DATA_CONFLICT'
            : response.status === 400 ? 'API_INVALID_REQUEST'
              : response.status === 413 ? 'API_PAYLOAD_TOO_LARGE'
                : response.status === 429 ? 'API_RATE_LIMITED'
              : 'API_REQUEST_FAILED';
    throw new ApiError(response.status, typeof body.errorCode === 'string' && body.errorCode ? body.errorCode : fallback, body);
  }

  // 204/empty bodies (e.g. NoContent) have nothing to parse
  if (response.status === 204) {
    return undefined as T;
  }
  let text: string;
  const metadata = { traceId: response.headers.get('X-Trace-Id') };
  try {
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(response.status, 'API_RESPONSE_READ_ERROR', metadata);
  }
  try {
    return (text ? JSON.parse(text) : undefined) as T;
  } catch {
    throw new ApiError(response.status, 'API_INVALID_RESPONSE', metadata);
  }
}

export function commonApiErrorMessage(errorCode: string | null | undefined): string {
  switch (errorCode) {
    case 'API_NETWORK_ERROR': return 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.';
    case 'API_SERVER_ERROR': return 'Máy chủ gặp lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.';
    case 'API_UNAUTHORIZED': return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'API_FORBIDDEN': return 'Bạn không có quyền thực hiện thao tác này.';
    case 'API_NOT_FOUND': return 'Dữ liệu không còn tồn tại. Vui lòng tải lại trang.';
    case 'API_INVALID_REQUEST': return 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.';
    case 'API_PAYLOAD_TOO_LARGE': return 'Dữ liệu gửi lên vượt quá dung lượng cho phép. Vui lòng giảm kích thước và thử lại.';
    case 'API_RATE_LIMITED': return 'Bạn gửi yêu cầu quá nhanh. Vui lòng chờ một lúc rồi thử lại.';
    case 'API_INVALID_RESPONSE': return 'Máy chủ trả về dữ liệu không đúng định dạng. Vui lòng thử lại sau.';
    case 'API_RESPONSE_READ_ERROR': return 'Không thể đọc hết phản hồi từ máy chủ. Vui lòng tải lại dữ liệu trước khi thử lại thao tác.';
    case 'DATA_CONFLICT': return 'Dữ liệu bị trùng hoặc đã được thay đổi. Vui lòng tải lại và kiểm tra.';
    case 'DATA_REFERENCE_CONFLICT': return 'Dữ liệu liên quan đã thay đổi hoặc đang được sử dụng. Vui lòng tải lại và kiểm tra.';
    default: return 'Không thể thực hiện thao tác. Vui lòng thử lại.';
  }
}

/** Domain messages share one fallback and never infer a network failure from an unknown exception. */
export function apiErrorMessage(
  error: unknown,
  resolveCode: (code: string | null | undefined) => string = commonApiErrorMessage,
): string {
  if (!(error instanceof ApiError)) return commonApiErrorMessage(null);
  const message = resolveCode(error.errorCode);
  return error.traceId ? `${message} Mã tra cứu: ${error.traceId}.` : message;
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
