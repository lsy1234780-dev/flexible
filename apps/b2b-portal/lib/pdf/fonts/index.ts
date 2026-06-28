import { Font } from '@react-pdf/renderer';
import path from 'path';
import fs from 'fs';

let registered = false;

/**
 * NotoSansKR 폰트를 @react-pdf/renderer 에 등록합니다.
 * src/fonts/NotoSansKR-Regular.ttf, NotoSansKR-Bold.ttf 가 필요합니다.
 * 없을 경우 `npm run setup` 을 먼저 실행하세요.
 */
export function registerFonts(): void {
  if (registered) return;

  // 폰트 디렉토리를 cwd에 의존하지 않고 여러 후보에서 탐색.
  // (dev/build를 apps/b2b-portal 또는 모노레포 루트 어디서 실행하든 동작)
  const FONT_FILE = 'NotoSansKR-Regular.ttf';
  const candidates = [
    process.env.PDF_FONTS_DIR,
    path.join(process.cwd(), 'lib/pdf/fonts'),               // cwd = apps/b2b-portal
    path.join(process.cwd(), 'apps/b2b-portal/lib/pdf/fonts'), // cwd = 모노레포 루트
    typeof __dirname !== 'undefined' ? __dirname : undefined,  // 번들이 안 풀린 경우
  ].filter((d): d is string => Boolean(d));

  const fontsDir = candidates.find((d) => fs.existsSync(path.join(d, FONT_FILE)));

  if (!fontsDir) {
    throw new Error(
      `[pdf-lib] 폰트 파일을 찾을 수 없습니다: ${FONT_FILE}\n` +
        `탐색한 경로: ${candidates.join(', ')}\n` +
        'PDF_FONTS_DIR 환경변수로 폰트 디렉토리를 지정하거나 폰트를 배치하세요.'
    );
  }

  const regularPath = path.join(fontsDir, 'NotoSansKR-Regular.ttf');
  const boldPath = path.join(fontsDir, 'NotoSansKR-Bold.ttf');

  Font.register({
    family: 'NotoSansKR',
    fonts: [
      { src: regularPath, fontWeight: 'normal' },
      // Bold 파일이 있으면 등록, 없으면 Regular 로 대체
      {
        src: fs.existsSync(boldPath) ? boldPath : regularPath,
        fontWeight: 'bold',
      },
    ],
  });

  // 긴 단어 하이픈 없이 처리 (한국어에 적합)
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
