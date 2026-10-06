import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const LOCAL_CALLER_TOKEN_BYTES = 32;

export class LocalSecurityError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = "LocalSecurityError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function digestToken(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function generateCallerToken() {
  return randomBytes(LOCAL_CALLER_TOKEN_BYTES).toString("base64url");
}

export function assertAuthorizedCaller(authorizationHeader, expectedToken) {
  const prefix = "Bearer ";
  if (typeof authorizationHeader !== "string" || !authorizationHeader.startsWith(prefix)) {
    throw new LocalSecurityError("LOCAL_CALLER_UNAUTHORIZED", 401);
  }

  const suppliedToken = authorizationHeader.slice(prefix.length);
  if (suppliedToken.length === 0 || typeof expectedToken !== "string" || expectedToken.length === 0) {
    throw new LocalSecurityError("LOCAL_CALLER_UNAUTHORIZED", 401);
  }

  if (!timingSafeEqual(digestToken(suppliedToken), digestToken(expectedToken))) {
    throw new LocalSecurityError("LOCAL_CALLER_UNAUTHORIZED", 401);
  }
}

export function assertNoBrowserOrigin(originHeader) {
  if (originHeader !== undefined) {
    throw new LocalSecurityError("BROWSER_ORIGIN_REJECTED", 403);
  }
}
