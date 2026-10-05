export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");

  // Non-browser callers such as the verification scripts do not send Origin.
  // Browser mutations with an Origin must be same-origin to keep the cookie
  // session from being usable as a cross-site request forgery primitive.
  if (!origin) {
    return true;
  }
  if (origin === "null") {
    return false;
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    const configuredOrigin = process.env.VICUS_APP_URL
      ? new URL(process.env.VICUS_APP_URL).origin
      : null;
    return new URL(origin).origin === requestOrigin || new URL(origin).origin === configuredOrigin;
  } catch {
    return false;
  }
}

export function hasOversizedBody(request: Request, maximumBytes: number) {
  const contentLength = request.headers.get("content-length");
  return contentLength ? Number(contentLength) > maximumBytes : false;
}
