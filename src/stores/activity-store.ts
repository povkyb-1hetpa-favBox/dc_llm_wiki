import { create } from "zustand"

export interface ActivityItem {
  id: string
  type: "ingest" | "lint" | "query"
  title: string
  status: "running" | "done" | "error"
  detail: string
  filesWritten: string[]
  createdAt: number
}

interface ActivityState {
  items: ActivityItem[]
  addItem: (item: Omit<ActivityItem, "id" | "createdAt">) => string
  updateItem: (id: string, updates: Partial<Pick<ActivityItem, "status" | "detail" | "filesWritten">>) => void
  appendDetail: (id: string, text: string) => void
  clearDone: () => void
}

let counter = 0

export const useActivityStore = create<ActivityState>((set, get) => {
  const lastUpdateTimes = new Map<string, number>()
  const pendingUpdates = new Map<string, Partial<ActivityItem>>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const flushUpdate = (id: string) => {
    const updates = pendingUpdates.get(id)
    if (!updates) return

    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }))

    lastUpdateTimes.set(id, Date.now())
    pendingUpdates.delete(id)
    if (timers.has(id)) {
      clearTimeout(timers.get(id)!)
      timers.delete(id)
    }
  }

  return {
    items: [],

    addItem: (item) => {
      const id = `activity-${++counter}`
      set((state) => ({
        items: [
          { ...item, id, createdAt: Date.now() },
          ...state.items,
        ],
      }))
      return id
    },

    updateItem: (id, updates) => {
      const isCritical = updates.status === "done" || updates.status === "error"

      if (isCritical) {
        // Apply pending updates for this item first if any
        const pending = pendingUpdates.get(id)
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...pending, ...updates } : item
          ),
        }))
        lastUpdateTimes.set(id, Date.now())
        pendingUpdates.delete(id)
        if (timers.has(id)) {
          clearTimeout(timers.get(id)!)
          timers.delete(id)
        }
        return
      }

      // Merge into pending
      const currentPending = pendingUpdates.get(id) || {}
      pendingUpdates.set(id, { ...currentPending, ...updates })

      const now = Date.now()
      const last = lastUpdateTimes.get(id) || 0
      const THROTTLE_MS = 200

      if (now - last >= THROTTLE_MS) {
        flushUpdate(id)
      } else {
        if (!timers.has(id)) {
          const timer = setTimeout(() => {
            flushUpdate(id)
          }, THROTTLE_MS - (now - last))
          timers.set(id, timer)
        }
      }
    },

    appendDetail: (id, text) => {
      const item = get().items.find((i) => i.id === id)
      if (!item) return

      const pending = pendingUpdates.get(id)
      const currentDetail = pending?.detail ?? item.detail
      get().updateItem(id, { detail: currentDetail + text })
    },

    clearDone: () => {
      const itemsToClear = get().items.filter((i) => i.status !== "running")
      itemsToClear.forEach((i) => {
        lastUpdateTimes.delete(i.id)
        pendingUpdates.delete(i.id)
        if (timers.has(i.id)) {
          clearTimeout(timers.get(i.id)!)
          timers.delete(i.id)
        }
      })

      set((state) => ({
        items: state.items.filter((i) => i.status === "running"),
      }))
    },
  }
})
