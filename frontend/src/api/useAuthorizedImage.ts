import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';

/**
 * <img src> не может нести заголовок Authorization, поэтому байты запрашиваются
 * вручную через централизованный клиент и превращаются в blob URL. Обязательно
 * освобождается через revokeObjectURL при смене path/размонтировании — иначе
 * длительное листание фото копит утечку object URL в браузере.
 */
export function useAuthorizedImage(path: string | null): string | null {
  const { api } = useAuth();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      // oxlint-disable-next-line react/set-state-in-effect -- сброс url при смене/отсутствии path, единственный способ синхронизировать blob URL с внешним ресурсом
      setUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    api
      .requestBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path, api]);

  return url;
}
