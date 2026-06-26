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

  // PDF_FONTS_DIR 환경변수 우선 (Next.js 번들 환경에서는 __dirname 이 틀어짐)
  const fontsDir = process.env.PDF_FONTS_DIR ?? path.join(process.cwd(), 'lib/pdf/fonts');
  const regularPath = path.join(fontsDir, 'NotoSansKR-Regular.ttf');
  const boldPath = path.join(fontsDir, 'NotoSansKR-Bold.ttf');

  if (!fs.existsSync(regularPath)) {
    throw new Error(
      `[pdf-lib] 폰트 파일을 찾을 수 없습니다: ${regularPath}\n` +
        '먼저 `npm run setup` 을 실행하여 폰트를 다운로드하세요.'
    );
  }

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
