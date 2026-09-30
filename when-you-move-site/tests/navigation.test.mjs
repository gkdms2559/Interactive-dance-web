import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NavigationController } from '../src/navigation/NavigationController.ts'
import { hitBubble } from '../src/navigation/BubbleNavigation.ts'
import { fingertipToScreen } from '../src/handTracking/HandTracker.ts'
import { HandInteraction } from '../src/handTracking/HandInteraction.ts'

test('navigation loops both ways and preserves selection through play/back', () => {
  const controller = new NavigationController()
  assert.equal(controller.activate('prev', 0), true); assert.equal(controller.index, 4)
  assert.equal(controller.activate('next', 100), false)
  assert.equal(controller.activate('next', 1000), true); assert.equal(controller.index, 0)
  for (let i = 1; i <= 7; i++) controller.activate('next', 1000 + i * 1000)
  assert.equal(controller.index, 2)
  controller.activate('enter', 9000); assert.equal(controller.mode, 'play')
  assert.equal(controller.activate('next', 10000), false)
  controller.activate('back', 11000); assert.equal(controller.mode, 'gallery'); assert.equal(controller.index, 2)
})
test('circular hit area is wider than the visible membrane but excludes square corners', () => {
  const targets = [{ action: 'enter', x: 100, y: 100, hitRadius: 60 }]
  assert.equal(hitBubble({ x: 155, y: 100 }, targets)?.action, 'enter')
  assert.equal(hitBubble({ x: 155, y: 155 }, targets), undefined)
})
test('future fingertip mapping matches mirror and cover crop', () => {
  const map = point => fingertipToScreen({ ...point, timestamp: 0 }, { width: 1280, height: 720 }, { width: 400, height: 800 })
  assert.deepEqual(map({ x: .5, y: .5 }), { x: 200, y: 400 })
  assert.ok(map({ x: .4, y: .5 }).x > 200)
  assert.ok(map({ x: 0, y: .5 }).x > 400)
})
test('future contact adapter activates once until release and respects cooldown', () => {
  const input = new HandInteraction(), actions = [], targets = [{ action: 'enter', x: 100, y: 100, hitRadius: 60 }]
  const send = (point, time) => input.update(point, targets, action => actions.push(action), time)
  send({ x: 100, y: 100 }, 0); send({ x: 100, y: 100 }, 2000)
  assert.equal(actions.length, 1)
  send(null, 2100); send({ x: 100, y: 100 }, 2200)
  assert.equal(actions.length, 2)
  send(null, 2300); send({ x: 100, y: 100 }, 2400)
  assert.equal(actions.length, 2)
})
