import { DesireEntity } from '../../entities/DesireEntity'
import { startCanvas } from '../../modules/canvas/startCanvas'
import { WebcamPoseDetector } from '../../modules/pose/WebcamPoseDetector'
import { PoseTracker } from '../../modules/pose/PoseTracker'
import { PoseResponse } from '../../modules/art/PoseResponse'
import { CoreBehavior } from './CoreBehavior'
import { IntroSequence } from './IntroSequence'
import { Stardust } from './Stardust'

export function mountBlackCorePiece(host: HTMLElement): () => void {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', '어둠 속에서 살아 움직이는 작은 빛의 존재')
  const status = document.createElement('pre')
  status.className = 'motion-debug'
  status.style.cssText = 'position:fixed;top:12px;left:12px;margin:0;color:#aaa;font:10px monospace;opacity:.55;pointer-events:none;background:none'
  host.replaceChildren(canvas, status)
  const entity = new DesireEntity(), behavior = new CoreBehavior(), sequence = new IntroSequence(), dust = new Stardust()
  const response = new PoseResponse(), tracker = new PoseTracker()
  const detector = new WebcamPoseDetector((landmarks, timestamp) => {
    const pose = tracker.receive(landmarks, timestamp, canvas.clientWidth, canvas.clientHeight)
    response.receive(pose); sequence.receive(pose, timestamp)
  }, {
    wasmRoot: new URL(`${import.meta.env.BASE_URL}mediapipe/wasm`, document.baseURI).href,
    modelUrl: new URL(`${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`, document.baseURI).href,
  })
  let width = 0, height = 0, statusTime = 0, completed = false
  let previousPosition: { x: number; y: number } | null = null
  const resize = (w: number, h: number) => {
    if (w <= 0 || h <= 0 || (w === width && h === height)) return
    width = w; height = h; behavior.resize(w, h); sequence.resize(w, h); dust.clear(); previousPosition = null
    entity.setPresentation({ position: sequence.presentation().position ?? behavior.snapshot().position })
  }
  const disposeCanvas = startCanvas(canvas, {
    update(dt) {
      resize(canvas.clientWidth, canvas.clientHeight)
      if (completed) return
      if (sequence.state === 'INTRO') behavior.update(dt)
      const autonomous = behavior.snapshot()
      sequence.update(dt, sequence.presentation().position ?? autonomous.position)
      const intro = sequence.presentation()
      const position = intro.position ?? autonomous.position
      const velocity = previousPosition && dt > 0
        ? { x: (position.x - previousPosition.x) / dt, y: (position.y - previousPosition.y) / dt } : { x: 0, y: 0 }
      previousPosition = { ...position }
      const reaction = response.update(dt, width, height)
      for (const side of ['left', 'right'] as const) {
        const hand = reaction.influence[side]
        if (hand) reaction.influence[side] = { ...hand, reachAmount: hand.reachAmount * (1 - intro.retract), activity: hand.activity * (1 - intro.retract) }
      }
      entity.setState(reaction.state)
      entity.setPoseInfluence(reaction.influence)
      entity.setPresentation({ ...autonomous, position, velocity, state: sequence.state === 'INTRO' ? autonomous.state : sequence.state,
        scale: autonomous.scale * intro.scale, alpha: intro.alpha, glow: (sequence.state === 'INTRO' ? autonomous.glow : 0) + intro.glow,
        shiver: sequence.state === 'INTRO' ? autonomous.shiver : 0 })
      entity.update(dt)
      dust.update(dt, position, reaction.influence, sequence.state === 'ENTERING_DOOR' ? sequence.door() : undefined)
      statusTime += dt
      if (statusTime >= .1) {
        statusTime = 0
        const pose = tracker.snapshot()
        status.textContent = `${position.x.toFixed(1)}  ${position.y.toFixed(1)}\n${velocity.x.toFixed(2)}  ${velocity.y.toFixed(2)}\n${pose.leftWrist?.speed.toFixed(3) ?? '0.000'}  ${pose.rightWrist?.speed.toFixed(3) ?? '0.000'}`
      }
      if (sequence.state === 'INTRO_COMPLETE') { completed = true; detector.stop(); dust.clear(); status.remove() }
    },
    draw(context, w, h) {
      resize(w, h)
      if (!completed) { dust.draw(context); entity.draw(context, w, h) }
      sequence.draw(context)
    },
  })
  const startCamera = () => { if (!completed) void detector.start() }
  const stopCamera = () => detector.stop()
  window.addEventListener('pagehide', stopCamera); window.addEventListener('pageshow', startCamera)
  startCamera()
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true; detector.stop(); disposeCanvas(); dust.clear(); status.remove()
    window.removeEventListener('pagehide', stopCamera); window.removeEventListener('pageshow', startCamera)
    canvas.remove()
  }
}
