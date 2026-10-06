// Deterministic browser storage; unaffected by Node's experimental Web Storage.
export function testStorage() {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value))
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
  }
}
