import { useStore } from '@nanostores/react'
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react'

import { $uiSessionId } from '../app/uiStore.js'

// Bucket for prompts submitted before any session is live. `dispatchSubmission`
// in useSubmission deliberately queues while `sid` is null, and the drain effect
// in useMainApp flushes the queue the moment `ui.sid` appears — so this bucket is
// promoted into the arriving session, never abandoned.
const NO_SESSION_KEY = '__no_session__'

// Mutates `arr` in place; returned reference is the same input array, kept
// so callers can chain. Use `Array.prototype.toSpliced` if you need a copy.
export function removeAtInPlace<T>(arr: T[], i: number): T[] {
  if (i < 0 || i >= arr.length) {
    return arr
  }

  arr.splice(i, 1)

  return arr
}

/**
 * Per-session prompt queues, kept outside React so the isolation and promotion
 * rules are unit-testable without rendering the hook — the same reason
 * `removeAtInPlace` lives here as a pure export.
 *
 * `currentRef` is what `useQueue` hands out as `queueRef`, so consumers that
 * mutate the queue in place (useInputHandlers, useSubmission,
 * slash/commands/core) keep working untouched: a session switch swaps which
 * array `currentRef.current` points at, it does not change the ref's shape.
 */
export function createSessionQueueManager() {
  const buckets = new Map<string, string[]>()

  const bucketFor = (key: string): string[] => {
    let bucket = buckets.get(key)

    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
    }

    return bucket
  }

  const currentRef: MutableRefObject<string[]> = { current: bucketFor(NO_SESSION_KEY) }
  let sessionKey = NO_SESSION_KEY

  /**
   * Point the active queue at `sid`'s bucket and return it.
   *
   * Switching between two live sessions never moves prompts — carrying them
   * over is the leak this manager exists to close. The one exception is the
   * no-session -> live transition: prompts queued before a session existed have
   * no owner yet, so they are appended to the arriving session's own backlog
   * and the drain effect picks them up exactly as it did before bucketing.
   */
  const setSession = (sid: null | string): string[] => {
    const nextKey = sid || NO_SESSION_KEY

    if (sessionKey === NO_SESSION_KEY && nextKey !== NO_SESSION_KEY) {
      const pending = bucketFor(NO_SESSION_KEY)

      if (pending.length > 0) {
        bucketFor(nextKey).push(...pending)
        pending.length = 0
      }
    }

    sessionKey = nextKey
    currentRef.current = bucketFor(nextKey)

    return currentRef.current
  }

  return {
    currentRef,
    dequeue: () => currentRef.current.shift(),
    display: () => [...currentRef.current],
    enqueue: (text: string) => {
      currentRef.current.push(text)
    },
    remove: (i: number) => removeAtInPlace(currentRef.current, i),
    replace: (i: number, text: string) => {
      currentRef.current[i] = text
    },
    setSession
  }
}

export function useQueue() {
  const sid = useStore($uiSessionId)
  const managerRef = useRef<null | ReturnType<typeof createSessionQueueManager>>(null)

  if (!managerRef.current) {
    managerRef.current = createSessionQueueManager()
  }

  const manager = managerRef.current
  const queueRef = manager.currentRef
  const [queuedDisplay, setQueuedDisplay] = useState<string[]>(() => manager.display())
  const queueEditRef = useRef<number | null>(null)
  const [queueEditIdx, setQueueEditIdx] = useState<number | null>(null)

  const syncQueue = useCallback(() => setQueuedDisplay(manager.display()), [manager])

  const setQueueEdit = useCallback((idx: number | null) => {
    queueEditRef.current = idx
    setQueueEditIdx(idx)
  }, [])

  // Runs before useMainApp's drain effect (hooks flush in call order, and
  // useComposerState is called first), so the drain always reads the bucket that
  // belongs to the session it is about to send into. The queue-edit index points
  // into the outgoing session's array, so it cannot survive the swap.
  useEffect(() => {
    manager.setSession(sid)
    setQueueEdit(null)
    syncQueue()
  }, [manager, setQueueEdit, sid, syncQueue])

  const enqueue = useCallback(
    (text: string) => {
      manager.enqueue(text)
      syncQueue()
    },
    [manager, syncQueue]
  )

  const dequeue = useCallback(() => {
    const head = manager.dequeue()
    syncQueue()

    return head
  }, [manager, syncQueue])

  const replaceQ = useCallback(
    (i: number, text: string) => {
      manager.replace(i, text)
      syncQueue()
    },
    [manager, syncQueue]
  )

  const removeQ = useCallback(
    (i: number) => {
      const before = queueRef.current.length

      manager.remove(i)

      if (queueRef.current.length !== before) {
        syncQueue()
      }
    },
    [manager, queueRef, syncQueue]
  )

  return {
    dequeue,
    enqueue,
    queueEditIdx,
    queueEditRef,
    queueRef,
    queuedDisplay,
    removeQ,
    replaceQ,
    setQueueEdit,
    syncQueue
  }
}
