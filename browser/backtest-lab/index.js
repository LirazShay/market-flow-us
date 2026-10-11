import { createBacktestLabClient } from "./client.js";
import { createBacktestLabSurface } from "./surface.js";

const client = createBacktestLabClient();
createBacktestLabSurface({ client, initiallyVisible: true });
