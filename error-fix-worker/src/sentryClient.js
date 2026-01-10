const config = require('./config');

class SentryClient {
  constructor() {
    this.baseUrl = config.sentry.baseUrl;
    this.authToken = config.sentry.authToken;
    this.organization = config.sentry.organization;
    this.project = config.sentry.project;
  }

  /**
   * Make an authenticated request to Sentry API
   */
  async request(endpoint) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Sentry API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get the latest event for an issue
   * @param {string} issueId - Sentry issue ID
   * @returns {object} Full event details
   */
  async getLatestEvent(issueId) {
    try {
      const endpoint = `/issues/${issueId}/events/latest/`;
      const event = await this.request(endpoint);

      console.log('[Sentry API] Fetched latest event for issue:', issueId);
      return event;
    } catch (error) {
      console.error('[Sentry API] Error fetching latest event:', error.message);
      return null;
    }
  }

  /**
   * Get issue details
   * @param {string} issueId - Sentry issue ID
   * @returns {object} Issue details
   */
  async getIssue(issueId) {
    try {
      const endpoint = `/issues/${issueId}/`;
      const issue = await this.request(endpoint);

      console.log('[Sentry API] Fetched issue:', issueId);
      return issue;
    } catch (error) {
      console.error('[Sentry API] Error fetching issue:', error.message);
      return null;
    }
  }

  /**
   * Enrich error data with full details from Sentry API
   * @param {object} errorData - Basic error data from webhook
   * @returns {object} Enriched error data with full stack trace
   */
  async enrichErrorData(errorData) {
    if (!this.authToken) {
      console.warn('[Sentry API] No auth token configured, skipping enrichment');

      // If we don't have file location and can't enrich, mark as insufficient data
      if (!errorData.fileName) {
        console.error('[Sentry API] ERROR: No file location and cannot enrich without auth token');
        throw new Error('Insufficient error data: No stack trace and no Sentry auth token for enrichment');
      }

      return errorData;
    }

    if (!errorData.issueId) {
      console.warn('[Sentry API] No issue ID in error data, skipping enrichment');

      // If we don't have file location and can't enrich, mark as insufficient data
      if (!errorData.fileName) {
        console.error('[Sentry API] ERROR: No file location and no issue ID for enrichment');
        throw new Error('Insufficient error data: No stack trace and no issue ID for API enrichment');
      }

      return errorData;
    }

    try {
      // Fetch the latest event for this issue (has full stack trace)
      const event = await this.getLatestEvent(errorData.issueId);

      if (!event) {
        return errorData;
      }

      // Extract exception details
      const exception = event.entries?.find(e => e.type === 'exception');
      const exceptionValues = exception?.data?.values || [];
      const primaryException = exceptionValues[0] || {};

      // Extract stack frames
      const stackFrames = primaryException.stacktrace?.frames || [];

      // Find the most relevant frame (last in-app frame)
      const relevantFrame = [...stackFrames].reverse().find(f => f.inApp) ||
                           stackFrames[stackFrames.length - 1];

      // Extract request context
      const requestEntry = event.entries?.find(e => e.type === 'request');
      const requestData = requestEntry?.data || {};

      // Extract breadcrumbs for context
      const breadcrumbsEntry = event.entries?.find(e => e.type === 'breadcrumbs');
      const breadcrumbs = breadcrumbsEntry?.data?.values || [];

      // Build enriched error data
      const enrichedData = {
        ...errorData,
        // Override with better data from API
        errorType: primaryException.type || errorData.errorType,
        errorMessage: primaryException.value || errorData.errorMessage,

        // Full stack trace with context
        stackTrace: JSON.stringify(stackFrames.map(frame => ({
          filename: frame.filename,
          absPath: frame.absPath,
          lineNo: frame.lineNo,
          colNo: frame.colNo,
          function: frame.function,
          context: frame.context, // Surrounding code lines
          inApp: frame.inApp
        }))),

        // File location
        fileName: relevantFrame?.filename || relevantFrame?.absPath || errorData.fileName,
        lineNumber: relevantFrame?.lineNo || errorData.lineNumber,
        colNumber: relevantFrame?.colNo,
        functionName: relevantFrame?.function || errorData.functionName,

        // Additional context
        environment: event.environment || errorData.environment,
        release: event.release?.version,

        // Request context (if available)
        request: {
          url: requestData.url || errorData.request?.url,
          method: requestData.method || errorData.request?.method,
          headers: requestData.headers,
          data: requestData.data
        },

        // Recent breadcrumbs for debugging context
        breadcrumbs: breadcrumbs.slice(-10).map(b => ({
          type: b.type,
          category: b.category,
          message: b.message,
          timestamp: b.timestamp
        })),

        // Tags and extra context
        tags: event.tags || errorData.tags,
        contexts: event.contexts,

        // Full exception chain (for chained exceptions)
        exceptionChain: exceptionValues.map(ex => ({
          type: ex.type,
          value: ex.value,
          module: ex.module
        }))
      };

      console.log('[Sentry API] Enriched error data with full stack trace');
      console.log('[Sentry API] Stack frames count:', stackFrames.length);
      console.log('[Sentry API] Relevant file:', enrichedData.fileName, 'line:', enrichedData.lineNumber);

      return enrichedData;

    } catch (error) {
      console.error('[Sentry API] Error enriching data:', error.message);
      return errorData;
    }
  }
}

module.exports = SentryClient;
