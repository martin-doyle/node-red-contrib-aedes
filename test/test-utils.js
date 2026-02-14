/* eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */

/**
 * Logs detailed error information including AggregateError support.
 * Useful for debugging Node-RED and MQTT client errors in tests.
 */
function logError (err) {
  if (err instanceof AggregateError) {
    console.error('AggregateError:', err.message);
    console.error('Name:', err.name);
    console.error('Errors:', err.errors);
  } else {
    console.error('Error:', err.message || err.toString());
  }
}

module.exports = { logError };
