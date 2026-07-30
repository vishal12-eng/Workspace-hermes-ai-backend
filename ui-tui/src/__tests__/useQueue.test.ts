import { describe, expect, it } from 'vitest'

import { createSessionQueueManager, removeAtInPlace } from '../hooks/useQueue.js'

describe('removeAtInPlace', () => {
  it('removes the item at the given index in place', () => {
    const arr = ['a', 'b', 'c']

    removeAtInPlace(arr, 1)
    expect(arr).toEqual(['a', 'c'])
  })

  it('is a no-op when the index is out of bounds', () => {
    const arr = ['a', 'b']

    removeAtInPlace(arr, -1)
    removeAtInPlace(arr, 5)
    expect(arr).toEqual(['a', 'b'])
  })

  it('returns the same reference (mutates in place)', () => {
    const arr = ['x']
    const same = removeAtInPlace(arr, 0)

    expect(same).toBe(arr)
    expect(arr).toEqual([])
  })
})

describe('createSessionQueueManager', () => {
  it('keeps queued prompts scoped to their live session', () => {
    const manager = createSessionQueueManager()

    manager.setSession('session-a')
    manager.enqueue('follow-up for A')
    expect(manager.display()).toEqual(['follow-up for A'])

    // `/session new` and the sessions overlay switch `sid` with no busy guard,
    // so B must never inherit A's follow-ups.
    manager.setSession('session-b')
    expect(manager.display()).toEqual([])

    manager.enqueue('follow-up for B')
    expect(manager.display()).toEqual(['follow-up for B'])

    manager.setSession('session-a')
    expect(manager.display()).toEqual(['follow-up for A'])
    expect(manager.dequeue()).toBe('follow-up for A')
    expect(manager.display()).toEqual([])

    manager.setSession('session-b')
    expect(manager.display()).toEqual(['follow-up for B'])
  })

  it('preserves in-place queue mutations for the active session only', () => {
    const manager = createSessionQueueManager()

    manager.setSession('session-a')
    manager.enqueue('a1')
    manager.setSession('session-b')
    manager.enqueue('b1')

    // useSubmission re-inserts at the head through queueRef directly.
    manager.currentRef.current.unshift('b0')
    expect(manager.display()).toEqual(['b0', 'b1'])

    manager.setSession('session-a')
    expect(manager.display()).toEqual(['a1'])
  })

  it('promotes prompts queued before a session exists into the session that comes up', () => {
    const manager = createSessionQueueManager()

    // dispatchSubmission queues instead of sending while `sid` is null.
    manager.enqueue('pre-session prompt')
    expect(manager.display()).toEqual(['pre-session prompt'])

    manager.setSession('session-a')

    // The drain effect reads the live bucket the instant `sid` appears; if the
    // promotion is skipped the prompt is stranded in `__no_session__` forever.
    expect(manager.display()).toEqual(['pre-session prompt'])
    expect(manager.dequeue()).toBe('pre-session prompt')
    expect(manager.display()).toEqual([])
  })

  it('promotes only out of the no-session bucket, never on a live-to-live switch', () => {
    const manager = createSessionQueueManager()

    manager.enqueue('pre-session prompt')
    manager.setSession('session-a')
    expect(manager.display()).toEqual(['pre-session prompt'])

    manager.setSession('session-b')
    expect(manager.display()).toEqual([])

    manager.setSession('session-a')
    expect(manager.display()).toEqual(['pre-session prompt'])
  })

  it('appends promoted prompts after the arriving session own backlog', () => {
    const manager = createSessionQueueManager()

    manager.setSession('session-a')
    manager.enqueue('queued first, while A was live')

    // resetSession() clears `sid` before the next session id lands.
    manager.setSession(null)
    manager.enqueue('queued second, between sessions')

    manager.setSession('session-a')
    expect(manager.display()).toEqual(['queued first, while A was live', 'queued second, between sessions'])
  })
})
