/* ===== test-send.ts ===== */
/* 실제 이메일 발송 테스트 스크립트 */
/* 실행: npx tsx src/scripts/test-send.ts */

import 'dotenv/config';
import { sendConfirmEmail, sendMagicLink, sendResetPassword, sendWelcome, sendAlert, sendContactForm } from '../send';

/* -- 수신 테스트 이메일 주소 변경 -- */
const TEST_TO = process.env.TEST_EMAIL ?? 'delivered@resend.dev';

// Resend 무료 티어: 초당 2건 제한 → 600ms 간격으로 안전하게 발송
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const SEND_INTERVAL_MS = 600;

async function main(): Promise<void> {
  console.log('🚀 이메일 발송 테스트 시작...\n');
  console.log(`📬 수신 주소: ${TEST_TO}`);
  console.log('💡 Tip: 환경변수 TEST_EMAIL 로 수신자를 변경할 수 있습니다.\n');

  /* -- 1. 이메일 확인 -- */
  console.log('1️⃣  이메일 확인 (Confirm Email)...');
  const r1 = await sendConfirmEmail({
    to: TEST_TO,
    confirmUrl: 'https://example.com/auth/confirm?token=abc123',
    userEmail: TEST_TO,
  });
  console.log(r1.success ? `   ✅ 성공 (ID: ${r1.id})` : `   ❌ 실패: ${r1.error}`);
  await wait(SEND_INTERVAL_MS);

  /* -- 2. Magic Link -- */
  console.log('2️⃣  Magic Link 로그인...');
  const r2 = await sendMagicLink({
    to: TEST_TO,
    magicUrl: 'https://example.com/auth/magic?token=xyz789',
    userEmail: TEST_TO,
    expiresInMinutes: 15,
  });
  console.log(r2.success ? `   ✅ 성공 (ID: ${r2.id})` : `   ❌ 실패: ${r2.error}`);
  await wait(SEND_INTERVAL_MS);

  /* -- 3. 비밀번호 재설정 -- */
  console.log('3️⃣  비밀번호 재설정...');
  const r3 = await sendResetPassword({
    to: TEST_TO,
    resetUrl: 'https://example.com/auth/reset?token=reset456',
    userEmail: TEST_TO,
  });
  console.log(r3.success ? `   ✅ 성공 (ID: ${r3.id})` : `   ❌ 실패: ${r3.error}`);
  await wait(SEND_INTERVAL_MS);

  /* -- 4. 웰컴 이메일 -- */
  console.log('4️⃣  웰컴 이메일...');
  const r4 = await sendWelcome({
    to: TEST_TO,
    userName: '테스트 사용자',
    loginUrl: 'https://example.com/dashboard',
  });
  console.log(r4.success ? `   ✅ 성공 (ID: ${r4.id})` : `   ❌ 실패: ${r4.error}`);
  await wait(SEND_INTERVAL_MS);

  /* -- 5. 알림 (각 타입) -- */
  for (const alertType of ['info', 'success', 'warning', 'error'] as const) {
    console.log(`5️⃣  알림 (${alertType})...`);
    const r = await sendAlert({
      to: TEST_TO,
      alertType,
      title: `테스트 알림 (${alertType})`,
      message: `이것은 ${alertType} 타입의 테스트 알림입니다. 실제 서비스에서는 의미 있는 내용을 넣어주세요.`,
      ctaLabel: '확인하기',
      ctaUrl: 'https://example.com',
    });
    console.log(r.success ? `   ✅ 성공 (ID: ${r.id})` : `   ❌ 실패: ${r.error}`);
    await wait(SEND_INTERVAL_MS);
  }

  /* -- 6. 문의 폼 -- */
  console.log('6️⃣  문의 폼 접수...');
  const r6 = await sendContactForm({
    // to 미입력 시 EMAIL_CONTACT_TO 환경 변수 사용
    to: TEST_TO,
    senderName: '홍길동',
    senderEmail: 'user@example.com',
    subject: '서비스 이용 중 오류가 발생했습니다',
    message: '안녕하세요.\n결제 후 서비스 이용이 안 되고 있습니다.\n빠른 확인 부탁드립니다.',
    phone: '010-1234-5678',
    category: '결제 문의',
  });
  console.log(r6.success ? `   ✅ 성공 (ID: ${r6.id})` : `   ❌ 실패: ${r6.error}`);

  console.log('\n🏁 테스트 완료!');
  console.log('📊 결과는 https://resend.com/emails 에서 확인할 수 있습니다.');
}

main().catch(err => {
  console.error('❌ 테스트 중 오류 발생:', err);
  process.exit(1);
});
