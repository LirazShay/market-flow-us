export function createSerializedWriter(connection) {
  if (!connection || typeof connection.run !== "function") {
    throw new TypeError("writer connection is required");
  }

  let tail = Promise.resolve();

  function enqueue(work) {
    if (typeof work !== "function") {
      throw new TypeError("writer work must be a function");
    }

    const run = tail.then(() => work(connection));
    tail = run.catch(() => {});
    return run;
  }

  return Object.freeze({
    enqueue,
    async drain() {
      await tail;
    }
  });
}
