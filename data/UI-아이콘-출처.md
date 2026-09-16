# UI 아이콘 자산

## 장비 기호

- 원본: [OthelloRhin / MHW_Icons_SVG](https://github.com/OthelloRhin/MHW_Icons_SVG)
- 저작자: Thibault "Othello" BENOIT, MIT License
- 사용 범위: 14개 무기 종류, 머리·몸통·팔·허리·다리·호석의 공통 장비 기호. 원본은 World 표기를 사용하지만 **장비 수치, 스킬, 무기 데이터는 가져오지 않았다.** 사용자가 첨부한 고전 몬스터헌터 기호와 같은 형태의 선명한 벡터만 사용한다.
- 적용: 원본 SVG 경로를 인라인화하고 중복 ID를 제거했다. 색상은 앱 팔레트의 CSS 변수로 지정한다.
- 라이선스 원문은 `dist/assets/icons/LICENSE-MHW-Icons.txt`와 `dist/icons.js` 주석에 포함한다. 단일 HTML에도 원문이 유지된다.

## 브랜드 마크

- 사용자가 첨부한 투구 모티프를 바탕으로 위 벡터 투구와 새 원형 문장·방위 장식을 결합했다.
- 색상: Wilds 키비주얼의 모래색 금빛, 올리브, 어두운 녹색.
- `WildsIcons.logo()`는 SVG를 반환한다. 중복 사용 시 그라디언트 ID가 겹치지 않는다.

## 속성·상태이상

- 사용자가 지정한 [Wilds 상태 아이콘 시트](https://www.reddit.com/media?url=https%3A%2F%2Fpreview.redd.it%2Fstatus-icons-from-the-beta-containing-a-leaked-monster-icon-v0-bzct1enxvbzd1.png%3Fwidth%3D2048%26format%3Dpng%26auto%3Dwebp%26s%3D67468000161469ae345dce212b0a6941e62314c9).
- 원본은 `dist/assets/icons/wilds-status-original.png`, 2048×2048 PNG, 원본 픽셀 유지.
- 불·물·번개·얼음·용·독·마비·수면·폭파를 사용한다. 100×100 셀 좌표를 CSS `background-position`으로 표시하며, 원본 이미지 전체를 `icons.css`에 데이터 URL로 내장한다.
- 상태 시트의 무기/몬스터 기호나 조사 자료는 앱 기능 데이터로 사용하지 않는다.

## API

```js
WildsIcons.weapon('gunlance'); // 한글 '건랜스'도 지원
WildsIcons.armor('head');      // chest, arms, waist, legs, charm, set
WildsIcons.element('dragon'); // fire, water, thunder, ice, poison, paralysis, sleep, blast
WildsIcons.logo();
```

외부 네트워크 요청 없이 동작한다. 아이콘 크기는 CSS `--icon-size`로 조정한다.

## 무기 아이콘 외곽선 보강

- 14종 SVG의 모든 path에 64px viewBox 기준 3.5px 외곽선을 적용하고 채움보다 먼저 그립니다.
- 일반 테마는 짙은 윤곽선과 밝은 회색 내부, 다크 테마는 금색·올리브 내부를 사용합니다. 배경 path는 불투명한 윤곽선 색을 상속합니다.
- 무기 선택·등록·장비 카드·조합 상세에서 같은 `.mh-weapon-icon` 스타일이 적용됩니다.
