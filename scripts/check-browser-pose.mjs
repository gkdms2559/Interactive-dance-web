// Exercise the production build with real MediaPipe inference and a synthetic
// camera. CDP serves local assets: no HTTP/dev server or physical camera is opened.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, extname } from 'node:path'
import { spawn } from 'node:child_process'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const directory = await mkdtemp(join(tmpdir(), 'desire-pose-check-'))
const root = resolve('dist')
const origin = 'https://desire-pose.test'
const photoResponse = await fetch('https://storage.googleapis.com/mediapipe-assets/pose.jpg')
assert.ok(photoResponse.ok)
const photo = Buffer.from(await photoResponse.arrayBuffer())
const browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${join(directory, 'profile')}`,
  '--window-size=1200,900', '--enable-unsafe-swiftshader', 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket
let id = 0
const pending = new Map()
const sessions = new Map()
const failures = []
const call = (method, params = {}, sessionId) => new Promise((resolveCall, reject) => {
  const requestId = ++id
  const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
  pending.set(requestId, { resolve: (value) => { clearTimeout(timeout); resolveCall(value) }, reject })
  socket.send(JSON.stringify({ id: requestId, method, params, sessionId }))
})
const init = `
window.__fixture = { moving: true };
navigator.mediaDevices.getUserMedia = async () => {
  const image = new Image(); image.src = '${origin}/fixture.jpg'; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
  const context = canvas.getContext('2d');
  const paint = () => {
    const t = performance.now() / 1000;
    context.fillStyle = '#fff'; context.fillRect(0,0,640,480);
    const offset = __fixture.moving ? Math.sin(t * 2) * 65 : 0;
    context.drawImage(image, offset, 30, 600, 400);
  };
  paint(); setInterval(paint, 1000 / 30); return canvas.captureStream(30);
};`

async function event(message) {
  if (message.method === 'Target.attachedToTarget') {
    const { sessionId, targetInfo } = message.params
    const ready = (async () => {
      await call('Runtime.enable', {}, sessionId)
      if (targetInfo.type === 'page') {
        await call('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*` }] }, sessionId)
        await call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId)
        await call('Page.enable', {}, sessionId)
        await call('Page.addScriptToEvaluateOnNewDocument', { source: init }, sessionId)
      }
      await call('Runtime.runIfWaitingForDebugger', {}, sessionId)
      return sessionId
    })()
    sessions.set(targetInfo.targetId, ready)
    await ready
  } else if (message.method === 'Fetch.requestPaused') {
    const { requestId, request } = message.params
    try {
      const url = new URL(request.url)
      let body, extension
      if (url.pathname === '/fixture.jpg') { body = photo; extension = '.jpg' }
      else {
        const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
        assert.ok(path.startsWith(root + sep))
        body = await readFile(path)
        extension = extname(path)
      }
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.jpg': 'image/jpeg' }[extension] || 'application/octet-stream'
      await call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: mime }], body: body.toString('base64') }, message.sessionId)
    } catch {
      await call('Fetch.fulfillRequest', { requestId, responseCode: 404, body: '' }, message.sessionId)
    }
  } else if (message.method === 'Runtime.exceptionThrown') {
    failures.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  }
}

try {
  let endpoint
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const [port, path] = (await readFile(join(directory, 'profile', 'DevToolsActivePort'), 'utf8')).split('\n')
      endpoint = `ws://127.0.0.1:${port}${path}`; break
    } catch { await pause(100) }
  }
  assert.ok(endpoint)
  socket = new WebSocket(endpoint)
  await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id)
      if (message.error) request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result)
    } else void event(message).catch((error) => failures.push(error.message))
  }
  await call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
  while (!sessions.has(targetId)) await pause(20)
  const session = await sessions.get(targetId)
  await call('Page.navigate', { url: origin }, session)
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true }, session)
    return result.result.value
  }
  let snapshot
  for (let attempt = 0; attempt < 90; attempt++) {
    await pause(500)
    snapshot = await evaluate('window.__poseDebug?.snapshot()')
    if (snapshot?.camera.model === 'error') {
      console.log(JSON.stringify({ snapshot, failures, fixture: await evaluate('({ fixture: window.__fixture, gum: navigator.mediaDevices.getUserMedia.toString() })') }, null, 2))
      throw new Error(snapshot.camera.error)
    }
    if (snapshot?.pose.leftWrist && snapshot?.pose.rightWrist && snapshot.camera.inferences > 15) break
  }
  assert.equal(snapshot?.camera.model, 'ready')
  assert.equal(snapshot.pose.detected, true)
  assert.ok(snapshot.pose.leftWrist && snapshot.pose.rightWrist && snapshot.pose.nose)
  assert.ok(snapshot.pose.leftShoulder && snapshot.pose.rightShoulder)
  assert.ok(snapshot.camera.inferences > 15)
  assert.ok(snapshot.entity.excitement > 0.05)
  const screenshot = await call('Page.captureScreenshot', { format: 'png' }, session)
  await writeFile(join(directory, 'pose.png'), Buffer.from(screenshot.data, 'base64'))
  console.log(JSON.stringify({ active: snapshot, screenshot: join(directory, 'pose.png'), errors: failures }, null, 2))
  await evaluate('__fixture.moving = false')
  await pause(8500)
  const resting = await evaluate('window.__poseDebug.snapshot()')
  assert.ok(resting.entity.excitement < 0.08)
  for (const side of ['left', 'right']) {
    const reach = resting.reach[side]
    assert.ok(reach.reach > 0.9)
    assert.ok(reach.primaryLength > reach.targetDistance * 0.85)
    assert.ok(reach.primaryLength < reach.targetDistance * 1.05)
  }
  assert.ok(resting.renderFrames > snapshot.renderFrames + 60)
  console.log(JSON.stringify({ resting: resting.entity, heldReach: resting.reach, inferences: resting.camera.inferences }, null, 2))
  assert.deepEqual(failures, [])
  await call('Browser.close')
} finally {
  socket?.close()
  browser.kill()
}
