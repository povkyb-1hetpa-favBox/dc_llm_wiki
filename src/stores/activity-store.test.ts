import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { useActivityStore } from "./activity-store"

describe("ActivityStore", () => {
  beforeEach(() => {
    useActivityStore.setState({ items: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should add an item", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest",
      title: "Test",
      status: "running",
      detail: "",
      filesWritten: [],
    })
    expect(id).toBeDefined()
    expect(useActivityStore.getState().items).toHaveLength(1)
    expect(useActivityStore.getState().items[0].title).toBe("Test")
  })

  it("should throttle detail updates", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest",
      title: "Test",
      status: "running",
      detail: "Initial",
      filesWritten: [],
    })

    // First update should be immediate (since last update was 0)
    useActivityStore.getState().updateItem(id, { detail: "Update 1" })
    expect(useActivityStore.getState().items[0].detail).toBe("Update 1")

    // Second update within 200ms should be throttled
    useActivityStore.getState().updateItem(id, { detail: "Update 2" })
    expect(useActivityStore.getState().items[0].detail).toBe("Update 1")

    // Advance time by 100ms
    vi.advanceTimersByTime(100)
    useActivityStore.getState().updateItem(id, { detail: "Update 3" })
    expect(useActivityStore.getState().items[0].detail).toBe("Update 1")

    // Advance time to 200ms since last update
    vi.advanceTimersByTime(100)
    expect(useActivityStore.getState().items[0].detail).toBe("Update 3")
  })

  it("should apply status updates immediately and flush pending detail", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest",
      title: "Test",
      status: "running",
      detail: "Initial",
      filesWritten: [],
    })

    useActivityStore.getState().updateItem(id, { detail: "Update 1" }) // Immediate
    useActivityStore.getState().updateItem(id, { detail: "Update 2" }) // Throttled
    expect(useActivityStore.getState().items[0].detail).toBe("Update 1")

    useActivityStore.getState().updateItem(id, { status: "done" }) // Immediate
    expect(useActivityStore.getState().items[0].status).toBe("done")
    expect(useActivityStore.getState().items[0].detail).toBe("Update 2")
  })

  it("should throttle appendDetail calls", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest",
      title: "Test",
      status: "running",
      detail: "",
      filesWritten: [],
    })

    useActivityStore.getState().appendDetail(id, "A") // Immediate
    expect(useActivityStore.getState().items[0].detail).toBe("A")

    useActivityStore.getState().appendDetail(id, "B") // Throttled
    useActivityStore.getState().appendDetail(id, "C") // Throttled
    expect(useActivityStore.getState().items[0].detail).toBe("A")

    vi.advanceTimersByTime(200)
    expect(useActivityStore.getState().items[0].detail).toBe("ABC")
  })

  it("should clean up maps in clearDone", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest",
      title: "Test",
      status: "done",
      detail: "Initial",
      filesWritten: [],
    })

    useActivityStore.getState().updateItem(id, { detail: "New Detail" }) // Throttled if we had another update, but wait.
    // Actually, status "done" makes it immediate in updateItem if passed in updates.
    // But here it's already "done". So it's not critical in this update call.

    useActivityStore.getState().clearDone()
    expect(useActivityStore.getState().items).toHaveLength(0)
    // We can't easily check private maps, but we can check if it crashes or leaves artifacts.
  })
})
