import type { DesireState } from '../entities/DesireEntity'
import type { TrackedPose } from '../modules/pose/types'
import type { PoseDiagnostics } from '../modules/pose/WebcamPoseDetector'
import type { DesireEntity } from '../entities/DesireEntity'

interface PoseDebugSnapshot {
  camera: PoseDiagnostics
  pose: TrackedPose
  entity: DesireState
  reach: ReturnType<DesireEntity['getReachDiagnostics']>
  core: ReturnType<DesireEntity['getCoreDiagnostics']>
  trails: { segmentCount: number; reactivatedCount: number }
  renderFrames: number
}

declare global {
  interface Window { __poseDebug?: { snapshot: () => PoseDebugSnapshot } }
}

export function createPoseDebug(snapshot: () => PoseDebugSnapshot): () => void {
  const panel = document.createElement('pre')
  panel.dataset.poseDebug = ''
  panel.className = 'motion-debug'
  document.body.append(panel)
  window.__poseDebug = { snapshot }
  const point = (value: TrackedPose['nose']) => value ? `${value.x.toFixed(3)}, ${value.y.toFixed(3)}` : '—'
  const update = () => {
    const { camera, pose, reach, core, trails } = snapshot()
    panel.textContent = [
      `Camera: ${camera.camera} / Video: ${camera.video}`,
      `Model: ${camera.model}`,
      `Pose: ${pose.detected ? 'detected' : 'not detected'}`,
      `Nose x,y: ${point(pose.nose)}`,
      `Left Wrist x,y: ${point(pose.leftWrist)}`,
      `Right Wrist x,y: ${point(pose.rightWrist)}`,
      `Left Elbow x,y: ${point(pose.leftElbow ?? null)}`,
      `Right Elbow x,y: ${point(pose.rightElbow ?? null)}`,
      `Left Wrist Speed: ${(pose.leftWrist?.speed ?? 0).toFixed(3)}`,
      `Right Wrist Speed: ${(pose.rightWrist?.speed ?? 0).toFixed(3)}`,
      `Left Reach: ${reach.left.reach.toFixed(3)}`,
      `Right Reach: ${reach.right.reach.toFixed(3)}`,
      `Left Target Distance: ${reach.left.targetDistance.toFixed(1)} px`,
      `Right Target Distance: ${reach.right.targetDistance.toFixed(1)} px`,
      `Left Primary Tendril Length: ${reach.left.primaryLength.toFixed(1)} px`,
      `Right Primary Tendril Length: ${reach.right.primaryLength.toFixed(1)} px`,
      `Core Offset X: ${core.x.toFixed(2)} px`,
      `Core Offset Y: ${core.y.toFixed(2)} px`,
      `Core Distance From Center: ${core.distance.toFixed(2)} px`,
      `Core X / Y: ${core.position.x.toFixed(1)} / ${core.position.y.toFixed(1)}`,
      `Core Velocity X / Y: ${core.velocity.x.toFixed(1)} / ${core.velocity.y.toFixed(1)}`,
      `Core State: ${core.state}`,
      `Active Hand Target: ${core.activeHand}`,
      `Core Target X / Y: ${core.target ? `${core.target.x.toFixed(1)} / ${core.target.y.toFixed(1)}` : '—'}`,
      `Trail Segment Count: ${trails.segmentCount}`,
      `Reactivated Trail Count: ${trails.reactivatedCount}`,
    ].join('\n')
  }
  update()
  const timer = window.setInterval(update, 100)
  return () => { window.clearInterval(timer); panel.remove(); delete window.__poseDebug }
}
