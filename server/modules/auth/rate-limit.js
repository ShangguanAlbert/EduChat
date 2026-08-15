function readRequestAddress(req) {
  return String(req?.ip || req?.socket?.remoteAddress || "unknown").trim();
}

export function createAuthRateLimiter({
  windowMs,
  maxAttempts,
  errorMessage,
  maxTrackedAddresses = 5000,
}) {
  const safeWindowMs = Math.max(1000, Number(windowMs) || 1000);
  const safeMaxAttempts = Math.max(1, Number(maxAttempts) || 1);
  const attemptsByAddress = new Map();

  return function authRateLimiter(req, res, next) {
    const now = Date.now();
    const address = readRequestAddress(req);
    const current = attemptsByAddress.get(address);
    const active = current && current.expiresAt > now ? current : null;
    const nextCount = Number(active?.count || 0) + 1;
    const expiresAt = active?.expiresAt || now + safeWindowMs;
    attemptsByAddress.set(address, { count: nextCount, expiresAt });

    if (attemptsByAddress.size > maxTrackedAddresses) {
      for (const [key, entry] of attemptsByAddress) {
        if (entry.expiresAt <= now || attemptsByAddress.size > maxTrackedAddresses) {
          attemptsByAddress.delete(key);
        }
        if (attemptsByAddress.size <= maxTrackedAddresses) break;
      }
    }

    res.setHeader(
      "RateLimit-Reset",
      String(Math.max(1, Math.ceil((expiresAt - now) / 1000))),
    );
    if (nextCount > safeMaxAttempts) {
      res.setHeader("Retry-After", String(Math.ceil((expiresAt - now) / 1000)));
      res.status(429).json({
        error: String(errorMessage || "尝试次数过多，请稍后再试。"),
      });
      return;
    }
    next();
  };
}
