export {
  ProducerBridgeError,
  ProducerTransportError,
  createProducerBridge
} from "./producer-bridge.js";

export {
  RUNTIME_KEY,
  VIEWER_SHELL_KEY,
  VIEWER_WINDOW_NAME,
  createMarketScopeRuntime,
  startRuntime
} from "./application.js";

export {
  CURRENT_COLUMNS,
  createCurrentModel,
  createInitialCurrentSort,
  formatCurrentCell,
  formatRecorderHealth,
  nextCurrentSort,
  sortCurrentRows
} from "../viewer/current-model.js";

export {
  createCurrentSurface
} from "../viewer/current-surface.js";

export {
  HISTORY_COLUMNS,
  appendDetailHistory,
  createDetailModel,
  formatDetailSummaryValue,
  formatHistoryCell
} from "../viewer/detail-model.js";

export {
  createDetailSurface
} from "../viewer/detail-surface.js";

export {
  createViewerRefreshController
} from "../viewer/refresh-controller.js";

export {
  createScannerSurface
} from "../viewer/scanner-surface.js";

export {
  ViewerClientError,
  ViewerUnavailableError,
  createViewerClient
} from "../viewer/client.js";

import { startRuntime } from "./application.js";

startRuntime();
