export const DEFAULT_REPLAY_HOST_URL = "http://127.0.0.1:8766";

export class ReplayHostClientError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = "ReplayHostClientError";
    this.code = code;
    this.status = status;
  }
}

function assertBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Replay Host URL must be absolute.");
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/") {
    throw new TypeError("Replay Host URL must be loopback HTTP with no path.");
  }
  return url.origin;
}

async function parseResponse(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    throw new ReplayHostClientError("Replay Host returned an invalid response.", {
      status: response.status
    });
  }

  if (!response.ok) {
    throw new ReplayHostClientError("Replay Host rejected the request.", {
      code: typeof payload?.code === "string" ? payload.code : null,
      status: response.status
    });
  }
  return payload;
}

export function createReplayHostClient({
  baseUrl = DEFAULT_REPLAY_HOST_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis)
} = {}) {
  const normalizedBaseUrl = assertBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required.");

  let controlToken = null;
  let pairingPromise = null;

  async function pair() {
    if (controlToken !== null) return;
    if (pairingPromise) return await pairingPromise;

    pairingPromise = (async () => {
      const response = await fetchImpl(`${normalizedBaseUrl}/pair`, {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        credentials: "omit"
      });
      const payload = await parseResponse(response);
      if (typeof payload.controlToken !== "string" || payload.controlToken.length < 40) {
        throw new ReplayHostClientError("Replay Host pairing response was invalid.");
      }
      controlToken = payload.controlToken;
    })();

    try {
      await pairingPromise;
    } finally {
      pairingPromise = null;
    }
  }

  async function control(pathname, reason, { retryPairing = true } = {}) {
    await pair();
    const response = await fetchImpl(`${normalizedBaseUrl}${pathname}`, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${controlToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason })
    });

    if (response.status === 401 && retryPairing) {
      controlToken = null;
      await pair();
      return await control(pathname, reason, { retryPairing: false });
    }
    return await parseResponse(response);
  }

  return Object.freeze({
    pair,
    startRun: async (reason = "replay-start") => await control("/run/start", String(reason)),
    stopRun: async (reason = "replay-stop") => await control("/run/stop", String(reason)),
    getState: () => Object.freeze({
      baseUrl: normalizedBaseUrl,
      paired: controlToken !== null
    })
  });
}
