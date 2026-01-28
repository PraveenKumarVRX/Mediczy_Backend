import crypto from "crypto";

const parseAppKeys = (value = "") => {
  const entries = String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const keyMap = new Map();

  for (const entry of entries) {
    const [rawKey, rawSecrets] = entry.split(":");
    const key = String(rawKey || "").trim();
    const secrets = String(rawSecrets || "")
      .split("|")
      .map((secret) => secret.trim())
      .filter(Boolean);

    if (!key || secrets.length === 0) {
      continue;
    }

    const existing = keyMap.get(key) || new Set();
    for (const secret of secrets) {
      existing.add(secret);
    }
    keyMap.set(key, existing);
  }

  return keyMap;
};

const safeEquals = (a = "", b = "") => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export const requireAppKey = (req, res, next) => {
  const appKey = req.headers["x-app-key"];
  const appSecret = req.headers["x-app-secret"];

  if (!appKey || !appSecret) {
    return res.status(401).json({
      success: false,
      message: "Missing app credentials",
    });
  }

  const keyMap = parseAppKeys(process.env.MOBILE_APP_KEYS || "");
  if (keyMap.size === 0) {
    return res.status(500).json({
      success: false,
      message: "App credentials not configured",
    });
  }

  const allowedSecrets = keyMap.get(String(appKey).trim());
  if (!allowedSecrets) {
    return res.status(401).json({
      success: false,
      message: "Invalid app credentials",
    });
  }

  for (const secret of allowedSecrets) {
    if (safeEquals(secret, appSecret)) {
      req.appClient = { key: String(appKey).trim() };
      return next();
    }
  }

  return res.status(401).json({
    success: false,
    message: "Invalid app credentials",
  });
};
