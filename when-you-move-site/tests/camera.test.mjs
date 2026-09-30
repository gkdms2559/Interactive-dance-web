import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CameraFeed } from '../src/camera/CameraFeed.ts'

function environment(getUserMedia) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() {
    return { classList: { add() {}, remove() {} }, setAttribute() {}, async play() { this.played = true }, pause() {}, textContent: '' }
  } } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia } } })
  return () => {
    for (const [name, descriptor] of [['document', previousDocument], ['navigator', previousNavigator]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]
    }
  }
}
test('camera attaches and plays video without audio, and releases tracks on stop', async () => {
  let stopped = 0, constraints
  const track = { stop() { stopped++ }, addEventListener() {} }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const restore = environment(async input => { constraints = input; return stream })
  try {
    const camera = new CameraFeed(); await camera.start()
    assert.equal(constraints.audio, false); assert.equal(camera.video.srcObject, stream); assert.equal(camera.video.played, true)
    camera.stop(); assert.equal(stopped, 1); assert.equal(camera.video.srcObject, null)
  } finally { restore() }
})
test('denied camera resolves with a minimal notice instead of breaking the site', async () => {
  const restore = environment(async () => { throw new Error('denied') })
  try {
    const camera = new CameraFeed(); await camera.start()
    assert.match(camera.notice.textContent, /Camera unavailable/); assert.equal(camera.video.srcObject, null)
  } finally { restore() }
})
test('permission resolving after disposal stops the late stream', async () => {
  let resolve, stopped = 0
  const restore = environment(() => new Promise(done => { resolve = done }))
  try {
    const camera = new CameraFeed(), pending = camera.start(); camera.stop()
    resolve({ getTracks: () => [{ stop() { stopped++ } }] }); await pending
    assert.equal(stopped, 1); assert.equal(camera.video.srcObject, null)
  } finally { restore() }
})
