/* Public rollout switch only. Provider credentials and worker tokens never belong here. */
(function () {
  'use strict';
  window.T08_LEARNING_CONFIG = Object.freeze({
    enabled: false,
    functionName: 'learning-api',
    requestTimeoutMs: 25000,
    pollIntervalMs: 4000
  });
})();
