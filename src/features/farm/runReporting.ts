// Starts are best effort: telemetry must never delay a round or show an error.
// The server deduplicates runId, including when the first response was lost.
export async function reportFarmStart(runId: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const controller = new AbortController()
      timeout = setTimeout(() => controller.abort(), 6000)
      const response = await fetch('/api/farm/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Echo-Request': '1' },
        body: JSON.stringify({ runId }),
        keepalive: true,
        signal: controller.signal,
      })
      // Invalid requests and rate limits should not create another request.
      if (response.ok || response.status < 500) return
    } catch {
      // One retry also covers a timeout or a response lost after persistence.
    } finally {
      clearTimeout(timeout)
    }
  }
}
