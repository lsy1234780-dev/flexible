/* ===== send.ts ===== */
/* 이메일 발송 핵심 함수 및 템플릿별 전용 발송 함수 */

import { render } from '@react-email/components';

import { getResendClient, getDefaultFrom, getDefaultBrandName } from './client';
import { ConfirmEmailTemplate } from './templates/auth/confirm-email';
import { MagicLinkTemplate } from './templates/auth/magic-link';
import { ResetPasswordTemplate } from './templates/auth/reset-password';
import { WelcomeTemplate } from './templates/auth/welcome';
import { AlertTemplate } from './templates/notification/alert';
import { ContactFormTemplate } from './templates/notification/contact-form';

import type {
  EmailOptions,
  BulkEmailItem,
  BulkSendResult,
  SendResult,
  SendConfirmEmailOptions,
  SendMagicLinkOptions,
  SendResetPasswordOptions,
  SendWelcomeOptions,
  SendAlertOptions,
  SendContactFormOptions,
} from './types';

/* ===== 기본 발송 함수 ===== */

/* -- 단건 발송 -- */
export async function sendEmail(options: EmailOptions): Promise<SendResult> {
  const client = getResendClient();
  const from = options.from ?? getDefaultFrom();

  try {
    const html = await render(options.template);
    const text = await render(options.template, { plainText: true });

    const { data, error } = await client.emails.send({
      from,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html,
      text,
      replyTo: options.replyTo,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : undefined,
      headers: options.headers,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType,
      })),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/* -- 벌크 발송 (순차 처리, rate limit 안전) -- */
export async function sendBulkEmail(items: BulkEmailItem[]): Promise<BulkSendResult> {
  const results: BulkSendResult['results'] = [];

  for (const item of items) {
    const to = item.to;
    const result = await sendEmail(item);
    results.push({ ...result, to });

    // Resend 무료 티어 rate limit 대응 (100ms 간격)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const succeeded = results.filter(r => r.success).length;

  return {
    total: items.length,
    succeeded,
    failed: items.length - succeeded,
    results,
  };
}

/* ===== 템플릿별 전용 발송 함수 ===== */

/* -- 이메일 확인 (회원가입) -- */
export async function sendConfirmEmail(options: SendConfirmEmailOptions): Promise<SendResult> {
  const brandName = options.brandName ?? getDefaultBrandName();
  return sendEmail({
    ...options,
    subject: `[${brandName}] 이메일 주소를 확인해 주세요`,
    template: ConfirmEmailTemplate({ ...options, brandName }),
  });
}

/* -- Magic Link 로그인 -- */
export async function sendMagicLink(options: SendMagicLinkOptions): Promise<SendResult> {
  const brandName = options.brandName ?? getDefaultBrandName();
  return sendEmail({
    ...options,
    subject: `[${brandName}] 로그인 링크가 도착했습니다`,
    template: MagicLinkTemplate({ ...options, brandName }),
  });
}

/* -- 비밀번호 재설정 -- */
export async function sendResetPassword(options: SendResetPasswordOptions): Promise<SendResult> {
  const brandName = options.brandName ?? getDefaultBrandName();
  return sendEmail({
    ...options,
    subject: `[${brandName}] 비밀번호 재설정 안내`,
    template: ResetPasswordTemplate({ ...options, brandName }),
  });
}

/* -- 웰컴 이메일 -- */
export async function sendWelcome(options: SendWelcomeOptions): Promise<SendResult> {
  const brandName = options.brandName ?? getDefaultBrandName();
  return sendEmail({
    ...options,
    subject: `${brandName}에 오신 것을 환영합니다!`,
    template: WelcomeTemplate({ ...options, brandName }),
  });
}

/* -- 범용 알림 -- */
export async function sendAlert(options: SendAlertOptions): Promise<SendResult> {
  const brandName = options.brandName ?? getDefaultBrandName();
  return sendEmail({
    ...options,
    subject: `[${brandName}] ${options.title}`,
    template: AlertTemplate({ ...options, brandName }),
  });
}

/* -- 문의 폼 접수 --
 * From:     인증된 발신 도메인 (EMAIL_FROM)
 * To:       회사 이메일 (options.to 또는 EMAIL_CONTACT_TO 환경 변수)
 * Reply-To: 문의자 이메일 → 회신 시 문의자에게 바로 전달됨
 */
export async function sendContactForm(options: SendContactFormOptions): Promise<SendResult> {
  const brandName = options.brandName ?? getDefaultBrandName();

  // 수신 주소 결정: 직접 전달 > 환경 변수
  const to = options.to ?? process.env.EMAIL_CONTACT_TO;
  if (!to) {
    return {
      success: false,
      error:
        '[resend-email-lib] 문의 수신 이메일이 설정되지 않았습니다.\n' +
        '  options.to 로 직접 전달하거나 EMAIL_CONTACT_TO 환경 변수를 설정하세요.',
    };
  }

  return sendEmail({
    from: options.from,
    to,
    subject: `[문의] ${options.subject}`,
    replyTo: options.senderEmail,   // ← 핵심: 회신 시 문의자 이메일로 전달
    template: ContactFormTemplate({
      ...options,
      brandName,
      submittedAt: options.submittedAt ?? new Date().toISOString(),
    }),
  });
}
