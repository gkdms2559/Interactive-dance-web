import { hitBubble } from '../navigation/BubbleNavigation.ts'
import type { BubbleTarget } from '../navigation/BubbleNavigation.ts'
import type { BubbleAction } from '../navigation/NavigationController.ts'
/** Optional adapter, not started. Requires release before another contact. */
export class HandInteraction {
  private contact: BubbleAction | null = null
  private lastActivation = -Infinity
  update(point: { x: number; y: number } | null, targets: BubbleTarget[], activateBubble: (action: BubbleAction) => void, now: number): void {
    const hit = point ? hitBubble(point, targets) : undefined
    if (!hit) { this.contact = null; return }
    if (this.contact === null && now - this.lastActivation >= 1000) { activateBubble(hit.action); this.lastActivation = now }
    this.contact = hit.action
  }
}
