import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApiClient } from '../api/client';
import { AuthContext, type AuthContextValue, type AuthStatus, type AuthUser } from './auth-context';

interface TelegramAuthResponse {
  token: string;
  user: AuthUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // JWT живёт только здесь (в памяти React), никогда в localStorage/sessionStorage (D21).
  // Ref нужен, чтобы api-клиент всегда читал актуальный токен без пересоздания на каждый рендер;
  // getToken вызывается только внутри fetch (client.ts), не во время рендера.
  const tokenRef = useRef<string | null>(null);

  // Возвращает новый токен при успехе или null при неудаче — так api-клиент (client.ts)
  // может молча переавторизоваться на 401 и повторить запрос, вместо разрыва сессии
  // (актуально для долгоживущего WebView за постоянной menu-button Telegram, где токен
  // может протухнуть в фоне без переоткрытия Mini App).
  const login = useCallback(async (): Promise<string | null> => {
    setStatus('loading');
    setError(null);

    // Единственный легитимный источник initData — реальный Telegram WebApp API.
    // Никакого обхода в коде: сервер (POST /api/auth/telegram) как проверял
    // HMAC-подпись Telegram, так и продолжает — здесь мы её не подделываем.
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    const initData = webApp?.initData;

    if (!initData) {
      setStatus('error');
      setError('initData не найден — приложение должно быть открыто через Telegram WebApp API.');
      return null;
    }

    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${res.status}`;
        throw new Error(message);
      }

      const data = (await res.json()) as TelegramAuthResponse;
      tokenRef.current = data.token;
      setUser(data.user);
      setStatus('ready');
      return data.token;
    } catch (err) {
      tokenRef.current = null;
      setUser(null);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Не удалось авторизоваться.');
      return null;
    }
  }, []);

  const api = useMemo(
    // oxlint-disable-next-line react/refs -- getToken вызывается при запросе (в client.ts), не при рендере
    () => createApiClient({ getToken: () => tokenRef.current, reauthenticate: login }),
    [login],
  );

  useEffect(() => {
    // Fetch-on-mount: единственный способ получить сессию — initData доступен
    // только после монтирования (Telegram WebApp API читается из window).
    // oxlint-disable-next-line react/set-state-in-effect -- login() асинхронный, setState идёт после await, не синхронно в эффекте
    void login();
  }, [login]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, error, api, retry: login }),
    [status, user, error, api, login],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
