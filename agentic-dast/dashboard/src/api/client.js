/**
 * Centralized API Client and Real-Time SSE Transport for Agentic Real-Time DAST Control Plane.
 *
 * Implements strict schema adherence, connection retry with backoff, safe SSE subscription,
 * error normalization, and non-blocking background task tracking.
 */

const BASE_URL = (
  (typeof window !== 'undefined' && window.__DAST_API_BASE_URL__) ||
  import.meta.env?.VITE_API_BASE_URL ||
  ''
).replace(/\/+$/, '')

export class DastApiError extends Error {
  constructor(message, status = 0, data = null, endpoint = '') {
    super(message)
    this.name = 'DastApiError'
    this.status = status
    this.data = data
    this.endpoint = endpoint
  }
}

/**
 * Standardized HTTP fetch wrapper with error normalization.
 */
export async function apiClient(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers || {}),
  }

  let response
  try {
    response = await fetch(url, {
      ...options,
      headers,
    })
  } catch (netErr) {
    throw new DastApiError(
      `Control plane unreachable: ${netErr.message || 'Network connection failed'}`,
      0,
      null,
      endpoint
    )
  }

  if (!response.ok) {
    let errorDetail = ''
    let parsedData = null
    try {
      const text = await response.text()
      try {
        parsedData = JSON.parse(text)
        errorDetail = parsedData.detail || parsedData.message || text
      } catch {
        errorDetail = text
      }
    } catch {
      errorDetail = `HTTP ${response.status} ${response.statusText}`
    }

    throw new DastApiError(
      errorDetail || `Request failed with status ${response.status}`,
      response.status,
      parsedData,
      endpoint
    )
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Endpoints for Agentic DAST Control Plane
 */
export const dastApi = {
  // Telemetry & Health
  getHealth: () => apiClient('/api/health'),
  getGatewayMetrics: () => apiClient('/api/gateway/metrics'),

  // Security Intelligence Data
  getTickets: () => apiClient('/api/tickets'),
  getGraph: () => apiClient('/api/graph'),
  getInventory: () => apiClient('/api/inventory'),
  getEventsHistory: () => apiClient('/api/events/history'),

  // Actions & Triggers
  startScan: (options = {}) =>
    apiClient('/api/scans/run', {
      method: 'POST',
      body: JSON.stringify({
        auto_approve_hitl_execution: options.auto_approve_hitl_execution ?? true,
        background: options.background ?? true,
        use_playwright: Boolean(options.use_playwright),
        delta_only: Boolean(options.delta_only),
      }),
    }),

  switchSimVersion: (options = {}) =>
    apiClient('/api/sim/switch', {
      method: 'POST',
      body: JSON.stringify({
        version: options.version || 'v1.0',
        reset_state: options.reset_state ?? true,
        trigger_webhook: options.trigger_webhook ?? true,
        is_fix_deploy: options.is_fix_deploy ?? (options.version === 'v1.2'),
        background: options.background ?? true,
      }),
    }),

  pollWatchers: () =>
    apiClient('/api/watchers/poll', {
      method: 'POST',
    }),

  retestTicket: (ticketId) =>
    apiClient(`/api/tickets/${encodeURIComponent(ticketId)}/retest`, {
      method: 'POST',
    }),

  // Human-in-the-Loop Decisions
  getHitlQueue: () => apiClient('/api/hitl'),
  decideHitl: (approvalId, approve) =>
    apiClient(`/api/hitl/${encodeURIComponent(approvalId)}/decide`, {
      method: 'POST',
      body: JSON.stringify({ approve: Boolean(approve) }),
    }),

  // OpenAPI Download URL
  getOpenApiUrl: () => `${BASE_URL}/api/openapi.json`,
}

/**
 * Robust SSE client with exponential backoff and duplicate suppression.
 */
export class SafeEventStream {
  constructor({
    endpoint = '/api/events/stream',
    onEvent = () => {},
    onStatusChange = () => {},
    onError = () => {},
    maxReconnectDelay = 10000,
  }) {
    this.endpoint = endpoint
    this.onEvent = onEvent
    this.onStatusChange = onStatusChange
    this.onError = onError
    this.maxReconnectDelay = maxReconnectDelay

    this.es = null
    this.reconnectAttempts = 0
    this.reconnectTimer = null
    this.isClosed = false
    this.seenEventKeys = new Set()
  }

  connect() {
    if (this.isClosed) return

    this.cleanupNative()

    const fullUrl = `${BASE_URL}${this.endpoint}`
    this.onStatusChange('CONNECTING')

    try {
      this.es = new EventSource(fullUrl)

      this.es.onopen = () => {
        this.reconnectAttempts = 0
        this.onStatusChange('CONNECTED')
      }

      this.es.onerror = (err) => {
        this.onStatusChange('DISCONNECTED')
        this.onError(err)
        this.cleanupNative()
        this.scheduleReconnect()
      }

      this.es.addEventListener('stage', (e) => {
        try {
          if (!e.data || e.data.trim() === '') return
          const parsed = JSON.parse(e.data)

          // Deduplicate by timestamp + stage + message
          const dedupeKey = `${parsed.timestamp || ''}-${parsed.stage || ''}-${parsed.message || ''}`
          if (this.seenEventKeys.has(dedupeKey)) {
            return
          }
          this.seenEventKeys.add(dedupeKey)
          if (this.seenEventKeys.size > 200) {
            // Prune oldest items to prevent memory leak
            const first = this.seenEventKeys.values().next().value
            this.seenEventKeys.delete(first)
          }

          this.onEvent(parsed)
        } catch {
          // Ignore malformed event payload gracefully
        }
      })
    } catch (err) {
      this.onStatusChange('DISCONNECTED')
      this.scheduleReconnect()
    }
  }

  scheduleReconnect() {
    if (this.isClosed || this.reconnectTimer) return

    // Exponential backoff with 20% jitter
    const delay = Math.min(
      this.maxReconnectDelay,
      1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500
    )
    this.reconnectAttempts += 1

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  cleanupNative() {
    if (this.es) {
      this.es.close()
      this.es = null
    }
  }

  close() {
    this.isClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cleanupNative()
    this.onStatusChange('DISCONNECTED')
  }
}
