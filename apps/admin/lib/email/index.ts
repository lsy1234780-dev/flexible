/* ===== index.ts ===== */
/* 공개 API 전체 re-export */

// 발송 함수
export {
  sendEmail,
  sendBulkEmail,
  sendConfirmEmail,
  sendMagicLink,
  sendResetPassword,
  sendWelcome,
  sendAlert,
  sendContactForm,
} from './send';

// 템플릿 (직접 렌더링이 필요한 경우)
export {
  ConfirmEmailTemplate,
  MagicLinkTemplate,
  ResetPasswordTemplate,
  WelcomeTemplate,
} from './templates/auth/index';

export { AlertTemplate } from './templates/notification/alert';
export { ContactFormTemplate } from './templates/notification/contact-form';

// 타입
export type {
  SendResult,
  BulkSendResult,
  EmailOptions,
  BulkEmailItem,
  ConfirmEmailProps,
  MagicLinkProps,
  ResetPasswordProps,
  WelcomeProps,
  AlertProps,
  AlertType,
  ContactFormProps,
  SendConfirmEmailOptions,
  SendMagicLinkOptions,
  SendResetPasswordOptions,
  SendWelcomeOptions,
  SendAlertOptions,
  SendContactFormOptions,
} from './types';
