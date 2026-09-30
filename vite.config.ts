import { defineConfig } from 'vite'

export default defineConfig({
  // The site is deployed as a GitHub Pages project site at
  // /Interactive-dance-web/. Keeping this in Vite makes every HTML entry
  // point to the correct asset location after deployment.
  base: '/Interactive-dance-web/',
  build: {
    rolldownOptions: { input: ['index.html', 'ice-cream-planet.html', 'thread-camera.html'] },
  },
})
