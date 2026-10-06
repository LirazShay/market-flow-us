function assertFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function.`);
  }
}

function assertSql(value) {
  if (typeof value !== "string") {
    throw new TypeError("Scanner draft SQL must be a string.");
  }
}

function assertPositiveInterval(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Scanner intervalMs must be a positive integer.");
  }
}

function normalizeNullableString(value, name) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string or null.`);
  }
  return value;
}

export function createScannerScheduler({
  execute,
  onResult = () => {},
  onError = () => {},
  setTimer = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimer = (timerId) => globalThis.clearTimeout(timerId),
  now = () => Date.now()
} = {}) {
  assertFunction(execute, "execute");
  assertFunction(onResult, "onResult");
  assertFunction(onError, "onError");
  assertFunction(setTimer, "setTimer");
  assertFunction(clearTimer, "clearTimer");
  assertFunction(now, "now");

  let draftSql = "";
  let draftIntervalMs = null;
  let draftQueryId = null;
  let draftQueryName = null;
  let activeSql = null;
  let activeIntervalMs = null;
  let activeQueryId = null;
  let activeQueryName = null;
  let generation = 0;
  let timerId = null;
  let inFlight = false;
  let stopped = false;

  function clearScheduledTimer() {
    if (timerId === null) return;
    clearTimer(timerId);
    timerId = null;
  }

  function getState() {
    return Object.freeze({
      generation,
      draftSql,
      draftIntervalMs,
      draftQueryId,
      draftQueryName,
      activeSql,
      activeIntervalMs,
      activeQueryId,
      activeQueryName,
      inFlight,
      timerScheduled: timerId !== null,
      stopped
    });
  }

  function setDraft({ sql, intervalMs, queryId = null, queryName = null }) {
    assertSql(sql);
    draftSql = sql;
    draftIntervalMs = intervalMs;
    draftQueryId = normalizeNullableString(queryId, "Scanner queryId");
    draftQueryName = normalizeNullableString(queryName, "Scanner queryName");
    return getState();
  }

  function scheduleNext(expectedGeneration) {
    if (
      stopped
      || expectedGeneration !== generation
      || activeIntervalMs === null
      || inFlight
    ) {
      return;
    }

    clearScheduledTimer();
    timerId = setTimer(() => {
      timerId = null;
      void executeGeneration(expectedGeneration);
    }, activeIntervalMs);
  }

  async function executeGeneration(expectedGeneration) {
    if (
      stopped
      || inFlight
      || expectedGeneration !== generation
      || activeSql === null
    ) {
      return;
    }

    const execution = Object.freeze({
      generation: expectedGeneration,
      sql: activeSql,
      intervalMs: activeIntervalMs,
      queryId: activeQueryId,
      queryName: activeQueryName,
      startedAtMs: now()
    });

    inFlight = true;
    let result;
    let executionError = null;

    try {
      result = await execute(execution.sql);
    } catch (error) {
      executionError = error;
    } finally {
      inFlight = false;
    }

    const context = Object.freeze({
      ...execution,
      completedAtMs: now()
    });

    if (stopped) return;

    if (expectedGeneration !== generation) {
      void executeGeneration(generation);
      return;
    }

    if (executionError === null) {
      onResult(result, context);
    } else {
      onError(executionError, context);
    }

    scheduleNext(expectedGeneration);
  }

  function activate() {
    assertSql(draftSql);
    assertPositiveInterval(draftIntervalMs);

    generation += 1;
    stopped = false;
    activeSql = draftSql;
    activeIntervalMs = draftIntervalMs;
    activeQueryId = draftQueryId;
    activeQueryName = draftQueryName;
    clearScheduledTimer();

    if (!inFlight) {
      void executeGeneration(generation);
    }

    return getState();
  }

  function stop() {
    if (stopped) return getState();
    // Stop invalidates the current generation and future timer only; Activate remains resumable from the latest draft.
    stopped = true;
    generation += 1;
    clearScheduledTimer();
    return getState();
  }

  return Object.freeze({
    setDraft,
    activate,
    stop,
    getState
  });
}
