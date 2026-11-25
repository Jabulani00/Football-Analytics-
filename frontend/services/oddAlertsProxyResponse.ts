const ODDALERTS_HOST = 'data.oddalerts.com';
const ODDALERTS_API_PREFIX = '/api/';
const PROXY_PATH = '/oddalerts';

function redactApiToken(value: string): string {
  return value.replace(/([?&]api_token=)[^&#\s"'<>]+/gi, '$1[redacted]');
}

function sanitizeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return redactApiToken(value);
  }

  if (!url.searchParams.has('api_token')) return value;

  if (url.hostname.toLowerCase() === ODDALERTS_HOST &&
    url.pathname.startsWith(ODDALERTS_API_PREFIX)) {
    const params = new URLSearchParams();
    params.set('path', url.pathname.slice(ODDALERTS_API_PREFIX.length));
    url.searchParams.forEach((paramValue, key) => {
      if (key !== 'api_token' && key !== 'path') params.append(key, paramValue);
    });
    return `${PROXY_PATH}?${params.toString()}`;
  }

  url.searchParams.delete('api_token');
  return url.toString();
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === 'string') {
    return /^(?:https?:)?\/\//i.test(value) ? sanitizeUrl(value) : redactApiToken(value);
  }
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key.toLowerCase() === 'api_token'
        ? '[redacted]'
        : sanitizeValue(child),
    ]),
  );
}

/** Strip server credentials from provider payloads before returning them to a client. */
export function sanitizeOddAlertsResponseBody(body: string, apiToken: string): string {
  let sanitized: string;
  try {
    sanitized = JSON.stringify(sanitizeValue(JSON.parse(body)));
  } catch {
    sanitized = redactApiToken(body);
  }

  return apiToken ? sanitized.split(apiToken).join('[redacted]') : sanitized;
}
