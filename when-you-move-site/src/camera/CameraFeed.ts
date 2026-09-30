export class CameraFeed {
  readonly video = document.createElement('video')
  readonly notice = document.createElement('span')
  private stream: MediaStream | null = null
  private epoch = 0
  constructor() {
    this.video.className = 'camera'; this.video.autoplay = true; this.video.muted = true; this.video.playsInline = true
    this.video.setAttribute('aria-hidden', 'true')
    this.notice.className = 'camera-notice'; this.notice.setAttribute('role', 'status')
  }
  async start(): Promise<void> {
    this.stop(); const epoch = this.epoch
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } })
      if (epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return }
      this.stream = stream; this.video.srcObject = stream
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (this.stream === stream) { this.stop(); this.notice.textContent = 'Camera unavailable · explore with your mouse' }
      }))
      await this.video.play()
      if (epoch === this.epoch) { this.video.classList.add('is-ready'); this.notice.textContent = '' }
    } catch {
      if (epoch === this.epoch) { this.stop(); this.notice.textContent = 'Camera unavailable · explore with your mouse' }
    }
  }
  stop(): void {
    this.epoch++; this.stream?.getTracks().forEach(track => track.stop()); this.stream = null
    this.video.pause(); this.video.srcObject = null; this.video.classList.remove('is-ready')
  }
}
