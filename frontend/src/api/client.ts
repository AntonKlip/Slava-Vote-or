export interface ApiError extends Error {
  status: number;
  body: unknown;
}

function makeApiError(status: number, body: unknown, fallbackMessage: string): ApiError {
  const message =
    body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : fallbackMessage;
  const err = new Error(message) as ApiError;
  err.status = status;
  err.body = body;
  return err;
}

export interface ApiClientOptions {
  getToken: () => string | null;
  reauthenticate: () => Promise<string | null>;
}

/**
 * Единственная точка, через которую фронтенд ходит в защищённые /api/* маршруты:
 * автоматически проставляет Authorization и централизованно реагирует на 401.
 * Токен может протухнуть под пользователем без видимого разрыва сессии (например,
 * постоянная menu-button Telegram Desktop держит один и тот же WebView открытым
 * часами) — при 401 делаем одну попытку re-auth и повторяем запрос, вместо того
 * чтобы сразу сбрасывать сессию в ошибку.
 */
export function createApiClient({ getToken, reauthenticate }: ApiClientOptions) {
  async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
    const doFetch = (token: string | null) => {
      const headers = new Headers(init.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return fetch(path, { ...init, headers });
    };

    let res = await doFetch(getToken());
    if (res.status === 401) {
      const freshToken = await reauthenticate();
      if (freshToken) {
        res = await doFetch(freshToken);
      }
    }
    return res;
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await rawRequest(path, init);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw makeApiError(res.status, body, `Request to ${path} failed with ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
    const res = await rawRequest(path, init);
    if (!res.ok) {
      throw makeApiError(res.status, null, `Request to ${path} failed with ${res.status}`);
    }
    return res.blob();
  }

  return { requestJson, requestBlob };
}

export type ApiClient = ReturnType<typeof createApiClient>;
