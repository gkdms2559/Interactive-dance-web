# When You Move

Vite + vanilla TypeScript + Canvas 2D 프로젝트입니다. 각 Piece는 독립 HTML entry로 실행합니다.

## Black core / tentacle

`index.html` → `src/main.ts` → `src/pieces/black-core/mountBlackCorePiece.ts`.
비표시 webcam → 기존 Pose Worker / PoseTracker / PoseResponse → 양손 target + reach를 재사용합니다.
핵은 nose를 따르지 않고 `CoreBehavior.ts`가 독립적으로 이동시킵니다.
REST(호흡), DRIFT(유영), HOP(2–3회 도약), SHIVER(짧은 진동), SPARKLE(두 번 반짝임), 드문 DASH를
지속시간과 가중치로 선택하며 화면 안전 여백을 유지합니다.

`DesireEntity.ts`는 핵과 기본 섬유 길이를 약 2배로, 섬유를 64가닥으로 늘렸습니다.
양손별 primary 2개와 secondary 7개가 실제 손목 방향으로 거의 직선에 가까이 뻗습니다.
팔꿈치 곡선이나 추가 위치 스프링은 사용하지 않습니다. 기존 `CoreMotion`, `ArmStrands`, `TrailSystem`은
보관된 실험 모듈이며 현재 entry에서는 실행하지 않습니다.

`Stardust.ts`는 핵의 실제 이동 구간에 수명과 크기가 다른 입자를 남깁니다.
빠른 손 동작에는 소량만 추가하고, 입자 수는 제한하며 오래된 입자는 제거합니다.
왼쪽 위 숫자는 핵 x/y, 실제 속도 x/y, 왼손/오른손 속도 순서입니다.

`IntroSequence.ts`는 손목 변위/시간을 화면 대각선으로 정규화합니다. 잡음 dead zone,
입력 중단 감지, idle 감쇠를 적용하고 충분한 움직임 누적 뒤 한 번만 전환합니다.
INTRO → DOOR_OPEN → APPROACHING_DOOR → ENTERING_DOOR → WHITE_TRANSITION → INTRO_COMPLETE.
실제 핵 위치에서 문까지 easing 이동한 뒤 작아지며 들어갑니다. 문 원점의 불투명 흰 원이
1.6초 동안 커져 화면을 덮습니다. 완료하면 카메라와 시뮬레이션을 멈추고 순백색만 유지합니다.

주요 튜닝은 `src/pieces/black-core/config.ts`: 핵 크기/행동 지속시간·확률, 촉수,
입자, 움직임 누적 threshold/gain/decay, 문 위치/크기/전환 시간을 조정할 수 있습니다.

## 검증

- `npm test`: 렌더링 좌표, 카메라 수명, 각 Piece 및 새 자율 행동/문 전환 회귀 검사.
- `npm run lint`: Oxlint.
- `npm run build`: TypeScript 검사(`tsc`)와 세 HTML entry의 Vite 빌드.
- 카메라 권한/추적 실패 시에도 자율 idle은 유지합니다. 영상은 표시하거나 업로드하지 않습니다.

## Ice Cream Planet — 독립 Piece

새 Piece의 주소는 `/ice-cream-planet.html`입니다. 기존 `/`는 black/core/tentacle Piece를 그대로 실행합니다.
`vite.config.ts`에서 두 HTML 진입점을 함께 빌드합니다. 별도의 메뉴나 Piece 선택 화면은 없습니다.
개발 서버를 직접 실행한 뒤 같은 서버 주소에 `/ice-cream-planet.html`을 붙여 확인할 수 있습니다.

새 구현은 `src/pieces/ice-cream-planet/`에 있습니다.

- `entry.ts`, `style.css`: 독립 흰 화면 진입점. 기존 검정 Piece의 CSS를 import하지 않습니다.
- `mountIceCreamPlanetPiece.ts`: 실행·정리, Canvas rAF, 텍스처 캐시, 기존 카메라·PoseTracker 연결.
- `config.ts`: 행성 위치·크기·색, idle, 종이 grain, 덩굴 속도·굵기·curl, 손 움직임 기준, 연쇄 반응·별 확률 등.
- `pencil.ts`: 종이 타일, 다섯 행성의 불규칙한 색연필 해칭·색 겹침·쿠키칩·스프링클, 덩굴 3중 stroke.
- `PlanetDrawing.ts`: 양손별 행성 선택, 제스처 감지, 가지와 curl 성장, 고정 크기 밀도 격자.
- `DrawingLayer.ts`: 이미 그린 선과 별을 유지하는 누적 Canvas. fade나 시간에 따른 삭제가 없습니다.

새 렌더러는 DesireEntity, CoreMotion, ArmStrands, 기존 TrailSystem에 의존하지 않습니다.
MediaPipe VIDEO Worker와 WebcamPoseDetector, PoseTracker만 공유하며 기존 파일은 변경하지 않았습니다.
사용하는 입력은 이미 거울 변환된 좌우 wrist(15/16) 좌표입니다. 영상은 표시하지 않습니다.
카메라 권한 거부·모델 오류에도 종이, 다섯 행성, 기본 별과 idle은 계속 표시됩니다.

손에서 행성 표면까지의 거리와 이동 방향을 비교합니다. 양손이 각자 선택을 유지하며,
0.65초 cooldown과 화면 대각선의 5.5% 이상 거리 개선이 있을 때만 다른 행성으로 바뀝니다.
첫 인식과 재인식은 이동으로 취급하지 않습니다. 마지막 growth 기준 위치에서 대각선의 0.8% 이상,
직전 샘플에서 0.15% 이상 움직였을 때만 새 줄기를 만들며 손별 0.38초 생성 간격을 둡니다.

큰 움직임에는 42% 확률, 최소 1.4초 간격으로 가까운 다른 행성 1~2개가 작은 덩굴을 만듭니다.
색은 줄기/가지가 시작할 때 파스텔 팔레트에서 선택하며 해당 줄기에서는 유지합니다.
성장 방향은 손 이동과 행성→손 방향을 섞고, 14×10 밀도 격자로 덜 채워진 방향에 약하게 편향합니다.
기존 curl 끝에서 이어 자라는 경우도 있어 행성 주변에서 화면 바깥 공간으로 그림이 확장됩니다.
별은 초기 32개, 추가 별은 확률과 최소 0.85초 간격으로 제한합니다.

과거 경로는 누적 Canvas에 한 번만 그립니다. 매 프레임은 새 구간만 rasterize하고,
누적 이미지를 한 번 합성한 뒤 작은 범위에서 떠다니는 다섯 행성 sprite를 그립니다.
동시 성장 줄기는 최대 28개, 연장 후보 끝점은 행성당 12개, 밀도 격자는 140칸으로 고정됩니다.
과거 벡터 path는 저장하지 않으며 완료된 성장 상태를 제거해도 이미 그린 픽셀은 남습니다.
DPR은 1.5로 제한하고, resize 시 기존 누적 그림을 새 Canvas로 복사해 유지합니다.
그림은 현재 세션 동안 누적되며 새로고침/재진입 때 새 그림으로 시작합니다. 저장 기능은 없습니다.

브라우저 확인: 초기 행성 5개와 적은 별 → 가만히 있을 때 추가 그림 없음 → 양손 독립 성장 →
크게 움직일 때 일부 이웃 행성의 반응 → 멈춘 뒤 그림 유지 → 창 크기 변경 뒤에도 누적 그림 유지.
색연필 질감과 초기 밀도는 `config.ts`에서 조절하세요. 실제 브라우저의 시각 확인은 사용자가 진행합니다.

### 참고 이미지 반영 튜닝

Ice Cream Planet의 `config.ts`에서 `planetPigments`는 행성별 색 혼합·얼룩 성격,
`pigmentStrength`/`pigmentPaperGaps`는 색층과 종이 여백을 조절합니다.
`vineStrokeWidth`/`branchStrokeRatio`/`pencilPressureVariation`은 주 줄기와 가는 가지의 필압,
`branchesPerStem`/`curlStartMin`/`curlStartMax`/`vineCurlAmount`는 곁가지 수와 말림을 조절합니다.
`largeStarProbability`/`largeStarMinSize`/`largeStarMaxSize`/`starClusterProbability`는
큰 채색 별과 작은 장식군의 비율입니다. 초기 화면에는 큰 덩굴을 미리 그리지 않습니다.
`densitySteeringInterval`마다 성장 방향을 다시 확인하며, `densityBias`와 `continuationProbability`로
빈 공간 유도와 기존 끝점에서 이어 그리는 비율을 조절합니다. 누적 그림은 지우지 않습니다.

## Thread Camera — 세 번째 독립 Piece

주소는 `/thread-camera.html`입니다. 기존 `/`와 `/ice-cream-planet.html`은 그대로입니다.
별도의 메뉴 없이 3개 HTML 진입점을 함께 빌드합니다.

신규 모듈은 `src/pieces/thread-camera/`에 있습니다.

- `entry.ts`, `style.css`, `mountThreadCameraPiece.ts`: 전체 화면 생카메라와 투명 Canvas, 실행·정리.
- `HandCamera.ts`: 보이는 video 하나에 getUserMedia 스트림 하나를 연결하고 같은 video에서 추론 프레임 추출.
- `hand.worker.ts`: 기존 tasks-vision 패키지/WASM을 사용한 Hand Landmarker VIDEO, 최대 2손, CPU Worker.
- `coordinates.ts`: 손바닥 중심과 object-fit cover/중앙 crop/거울 좌표 변환.
- `PalmTracker.ts`: handedness와 최근 위치로 양손 대응, 잡음 보정과 짧은 인식 누락 처리.
- `ThreadRenderer.ts`: 현재 손바닥 사이의 직선 하나. 본체와 아주 약한 외곽만 렌더링.
- `DustSystem.ts`: 실 주변의 유한 수명 미세 먼지, 최대 100개 풀.
- `config.ts`: 색·굵기·hold·잡음 보정·먼지·mirror 설정.

손바닥 중심은 wrist 0과 MCP 5/9/13/17을 사용합니다.
`0.5 × wrist + 0.125 × (index MCP + middle MCP + ring MCP + pinky MCP)`로
손목과 네 관절 평균의 중간점을 구합니다. 손목 끝점을 직접 연결하지 않습니다.
손을 교차해도 화면 x 정렬로 좌우를 바꾸지 않고 handedness와 시간적 연속성으로 대응합니다.

추론 입력은 Worker에서 먼저 좌우반전해 selfie 좌표로 만듭니다.
CSS 영상도 scaleX(-1), object-fit:cover, object-position:center를 사용합니다.
source video의 실제 폭·높이로 `scale=max(viewportWidth/videoWidth, viewportHeight/videoHeight)`를 계산하고
중앙 crop offset을 적용합니다. 추론을 위해 작게 만든 bitmap 크기로 화면 crop을 계산하지 않습니다.
`CAMERA_MIRROR=false`이면 추론 좌표의 x만 다시 반전하여 반전하지 않은 영상에 맞춥니다.

큰 움직임에는 위치 보간 지연이 없습니다. 3px 미만 변화에만 35ms 시정수 보정을 적용합니다.
짧은 인식 누락은 220ms 유지 후 220ms 시정수로 fade하며, 재인식은 45ms 시정수로 빠르게 나타납니다.
카메라/모델 추론 시간 자체는 장치 성능에 따라 달라집니다. 최대 24fps이며 프레임은 하나만 처리합니다.
모델 오류 시에도 이미 연결된 카메라는 유지하고 실은 정상 hold/fade로 사라집니다.
권한 확보 전에는 영상을 표시할 수 없으며, 별도의 검정/흰색 intro나 텍스트 안내는 없습니다.
권한을 거부하면 카메라 영상과 실이 표시되지 않습니다.

실 기본값은 `THREAD_COLOR='#C96BCF'`, `THREAD_WIDTH=8` CSS px입니다.
매 프레임 Canvas를 완전히 지워 현재 직선만 표시하고 trail이나 누적 그림은 저장하지 않습니다.
먼지는 대부분 1~2px, 드물게 최대 4px, 수명 1.8~4초이며 실 주위의 약 42px 폭에 주로 생성합니다.
손 속도에 약하게 반응하고 오래된 먼지는 제거해 풀 공간을 재사용합니다.
DEBUG 기본값은 false이며 true여도 console 진단만 출력하고 화면 marker는 추가하지 않습니다.

탭 숨김/복귀는 추론 epoch로 이전 결과를 버리고, Piece 정리와 페이지 이탈은 트랙·Worker·rAF·리스너를 종료합니다.
Hand 모델 파일은 `public/models/hand_landmarker.task`, 출처와 SHA-256은 `hand_landmarker.md`입니다.
기존 두 Piece와 Pose 추적 소스는 변경하지 않았습니다.

검사 대상: 양손 손바닥 중심 부착, 교차/겹침, 가로·세로 화면의 cover crop과 화면 가장자리,
잠깐 손을 가렸다가 다시 보이기, 이전 실 흔적 없음, 먼지의 제한된 밀도.
실제 webcam 시각 확인은 사용자가 진행하며 개발 서버는 자동 실행하지 않습니다.
