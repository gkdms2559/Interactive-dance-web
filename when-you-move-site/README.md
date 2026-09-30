# When You Move — website prototype

Independent Vite + vanilla TypeScript project. Parent project pieces are untouched.

```sh
cd when-you-move-site
npm install
npm run dev
```

`npm run build` checks TypeScript and builds to `dist`. `npm test` checks navigation and input geometry.

Camera uses one mirrored, cover-fitted video stream, without audio or upload. HTTPS or localhost is required. Denied/unavailable camera falls back to neutral gray with mouse navigation intact.

Five placeholder surfaces form a continuous, looping strip. Transparent soap bubbles support pointer proximity, click/pop and keyboard focus/Enter. ENTER opens the selected placeholder; BACK preserves selection.

`main.ts` exports `activateBubble(action)` shared by all inputs. `BubbleNavigation.targets()` exposes CSS-pixel centers and expanded hit radii. Add a model behind `handTracking/HandTracker.ts`, map raw fingertip coordinates with `fingertipToScreen`, then pass them to `HandInteraction.update` with the shared activation function. Tracking is not started or installed.

Tune sizes and timings in `styles/gallery.css`, `styles/bubbles.css`; placeholders in `gallery/galleryData.ts`; navigation cooldown in `NavigationController.ts`.

Design reference: https://www.imcd.design/
