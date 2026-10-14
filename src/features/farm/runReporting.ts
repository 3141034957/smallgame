// Starts are best effort: telemetry must never delay a round or show an error.
// The server deduplicates runId, including when the first response was lost.
export async function reportFarmStart(runId: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch('/api/farm/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Echo-Request': '1' },
        body: JSON.stringify({ runId }),
        keepalive: true,
        signal: AbortSignal.timeout(6000),
      })
      // Invalid requests and rate limits should not create another request.
      if (response.ok || response.status < 500) return
    } catch {
      // One retry also covers a timeout or a response lost after persistence.
    }
  }
}
