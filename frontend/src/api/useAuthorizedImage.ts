import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';

/**
 * <img src> не может нести заголовок Authorization, поэтому байты запрашиваются
 * вручную через централизованный клиент и превращаются в blob URL. Один и тот же
 * путь (то же фото — например, оно попадает и в список, и потом в топ-2 результатов)
 * кэшируется по модулю: без этого каждый новый PhotoCard заново гонял бы то же фото
 * через сеть, и при повторных рендерах фото визуально "догружались по одному".
 * Кэш живёт на весь сеанс (без revokeObjectURL) — размер пула фото конкурса мал,
 * а разделяемый objectURL нельзя отзывать, пока его использует другой компонент.
 */
const imageCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export function useAuthorizedImage(path: string | null): string | null {
  const { api } = useAuth();
  const [url, setUrl] = useState<string | null>(path ? (imageCache.get(path) ?? null) : null);

  useEffect(() => {
    if (!path) {
      // oxlint-disable-next-line react/set-state-in-effect -- сброс url при отсутствии path, единственный способ синхронизировать blob URL с внешним ресурсом
      setUrl(null);
      return;
    }

    const cached = imageCache.get(path);
    if (cached) {
      // oxlint-disable-next-line react/set-state-in-effect -- синхронизация с кэшем при смене path на уже загруженный
      setUrl(cached);
      return;
    }

    let cancelled = false;

    let promise = inFlight.get(path);
    if (!promise) {
      promise = api.requestBlob(path).then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        imageCache.set(path, objectUrl);
        return objectUrl;
      });
      inFlight.set(path, promise);
      promise.finally(() => inFlight.delete(path));
    }

    promise
      .then((objectUrl) => {
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [path, api]);

  return url;
}
