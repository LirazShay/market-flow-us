import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const CONTROL_TOKEN_BYTES = 32;

export class ReplayHostSecurityError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = "ReplayHostSecurityError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function generateReplayControlToken() {
  return randomBytes(CONTROL_TOKEN_BYTES).toString("base64url");
}

export function assertExactReplayOrigin(originHeader, allowedOrigin) {
  if (typeof originHeader !== "string" || originHeader !== allowedOrigin) {
    throw new ReplayHostSecurityError("REPLAY_ORIGIN_REJECTED", 403);
  }
}

export function assertReplayControlToken(authorizationHeader, expectedToken, paired) {
  if (paired !== true) {
    throw new ReplayHostSecurityError("REPLAY_CONTROL_UNAUTHORIZED", 401);
  }

  const prefix = "Bearer ";
  if (typeof authorizationHeader !== "string" || !authorizationHeader.startsWith(prefix)) {
    throw new ReplayHostSecurityError("REPLAY_CONTROL_UNAUTHORIZED", 401);
  }

  const supplied = authorizationHeader.slice(prefix.length);
  if (supplied.length === 0 || typeof expectedToken !== "string" || expectedToken.length === 0) {
    throw new ReplayHostSecurityError("REPLAY_CONTROL_UNAUTHORIZED", 401);
  }

  if (!timingSafeEqual(digest(supplied), digest(expectedToken))) {
    throw new ReplayHostSecurityError("REPLAY_CONTROL_UNAUTHORIZED", 401);
  }
}
