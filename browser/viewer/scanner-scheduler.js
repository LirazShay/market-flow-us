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

export function createScannerScheduler({
  execute,
  onResult = () => {},
  onError = () => {},
  setTimer = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimer = (timerId) => globalThis.clearTimeout(timerId)
} = {}) {
  assertFunction(execute, "execute");
  assertFunction(onResult, "onResult");
  assertFunction(onError, "onError");
  assertFunction(setTimer, "setTimer");
  assertFunction(clearTimer, "clearTimer");

  let draftSql = "";
  let draftIntervalMs = null;
  let activeSql = null;
  let activeIntervalMs = null;
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
      activeSql,
      activeIntervalMs,
      inFlight,
      timerScheduled: timerId !== null,
      stopped
    });
  }

  function setDraft({ sql, intervalMs }) {
    assertSql(sql);
    draftSql = sql;
    draftIntervalMs = intervalMs;
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

    const context = Object.freeze({
      generation: expectedGeneration,
      sql: activeSql,
      intervalMs: activeIntervalMs
    });

    inFlight = true;
    let result;
    let executionError = null;

    try {
      result = await execute(context.sql);
    } catch (error) {
      executionError = error;
    } finally {
      inFlight = false;
    }

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
    clearScheduledTimer();

    if (!inFlight) {
      void executeGeneration(generation);
    }

    return getState();
  }

  function stop() {
    if (stopped) return getState();
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
