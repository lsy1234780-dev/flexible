/* ===== types.ts ===== */
/* 공통 타입 및 인터페이스 정의 */

import type { ReactElement } from 'react';

/* -- 발송 결과 -- */
export interface SendResult {
  success: boolean;
  id?: string;    // Resend message ID
  error?: string;
}

/* -- 기본 이메일 옵션 -- */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  template: ReactElement;
  from?: string;  // 미입력 시 EMAIL_FROM 환경 변수 사용
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
}

/* -- 벌크 발송 아이템 -- */
export interface BulkEmailItem {
  to: string;
  subject: string;
  template: ReactElement;
  from?: string;
}

/* -- 벌크 발송 결과 -- */
export interface BulkSendResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<SendResult & { to: string }>;
}

/* -- 템플릿 공통 기반 props -- */
export interface BaseTemplateProps {
  brandName?: string;   // 기본값: process.env.EMAIL_BRAND_NAME || 'My Service'
  previewText?: string; // 이메일 클라이언트 미리보기 텍스트
}

/* -- 인증 템플릿 props -- */
export interface ConfirmEmailProps extends BaseTemplateProps {
  confirmUrl: string;
  userEmail?: string;
}

export interface MagicLinkProps extends BaseTemplateProps {
  magicUrl: string;
  userEmail?: string;
  expiresInMinutes?: number; // 기본값: 10
}

export interface ResetPasswordProps extends BaseTemplateProps {
  resetUrl: string;
  userEmail?: string;
  expiresInMinutes?: number; // 기본값: 60
}

export interface WelcomeProps extends BaseTemplateProps {
  userName?: string;
  loginUrl?: string;
}

/* -- 알림 템플릿 props -- */
export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps extends BaseTemplateProps {
  title: string;
  message: string;
  alertType?: AlertType;  // 기본값: 'info'
  ctaLabel?: string;      // CTA 버튼 텍스트 (없으면 버튼 미표시)
  ctaUrl?: string;        // CTA 버튼 링크
}

/* -- 문의 폼 템플릿 props -- */
export interface ContactFormProps extends BaseTemplateProps {
  senderName: string;         // 문의자 이름
  senderEmail: string;        // 문의자 이메일 (Reply-To로 설정됨)
  subject: string;            // 문의 제목
  message: string;            // 문의 내용
  phone?: string;             // 문의자 연락처 (선택)
  category?: string;          // 문의 유형 (선택, 예: '일반', '결제', '기술지원')
  submittedAt?: string;       // 제출 시각 (선택, ISO 문자열)
}

/* -- 전용 발송 함수 입력 -- */
export type SendConfirmEmailOptions = Omit<EmailOptions, 'subject' | 'template'> & ConfirmEmailProps;
export type SendMagicLinkOptions = Omit<EmailOptions, 'subject' | 'template'> & MagicLinkProps;
export type SendResetPasswordOptions = Omit<EmailOptions, 'subject' | 'template'> & ResetPasswordProps;
export type SendWelcomeOptions = Omit<EmailOptions, 'subject' | 'template'> & WelcomeProps;
export type SendAlertOptions = Omit<EmailOptions, 'subject' | 'template'> & AlertProps;

// ContactForm은 to를 필수로 오버라이드 (회사 이메일 주소 필요)
export type SendContactFormOptions = Omit<EmailOptions, 'subject' | 'template' | 'to' | 'replyTo'> &
  ContactFormProps & {
    to?: string; // 미입력 시 EMAIL_CONTACT_TO 환경 변수 사용
  };
