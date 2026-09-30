import { cp, mkdir } from 'node:fs/promises'

// Keep the loader and binary at exactly the installed tasks-vision version.
await mkdir('public/mediapipe/wasm', { recursive: true })
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe/wasm', { recursive: true })
