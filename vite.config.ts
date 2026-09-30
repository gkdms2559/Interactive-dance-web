import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: { input: ['index.html', 'ice-cream-planet.html', 'thread-camera.html'] },
  },
})
