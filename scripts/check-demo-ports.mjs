import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_DEMO_PORTS = Object.freeze([4173, 8765]);

export async function assertLoopbackPortsAvailable({
  host = "127.0.0.1",
  ports = DEFAULT_DEMO_PORTS
} = {}) {
  for (const port of ports) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.once("error", () => {
        reject(new Error(`Required demo port ${port} is unavailable.`));
      });
      server.listen({ host, port, exclusive: true }, () => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    });
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  try {
    await assertLoopbackPortsAvailable();
  } catch {
    process.stderr.write(
      "[ERROR] Market Flow US demo requires free loopback ports 4173 and 8765. Stop the older process and try again.\n"
    );
    process.exitCode = 1;
  }
}
