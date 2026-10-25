const hubs = new Map<string, (data: string) => void>()

export function registerHub(id: string, fn: (data: string) => void): () => void {
  hubs.set(id, fn)
  return () => {
    if (hubs.get(id) === fn) hubs.delete(id)
  }
}

export function writeHub(id: string, data: string): void {
  hubs.get(id)?.(data)
}
