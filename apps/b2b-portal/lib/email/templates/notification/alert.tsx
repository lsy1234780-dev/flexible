/* ===== AlertTemplate ===== */
/* 범용 알림 이메일 템플릿 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

import type { AlertProps, AlertType } from '../../types';

/* -- 알림 타입별 색상 맵 -- */
const ALERT_COLORS: Record<AlertType, { bg: string; border: string; text: string; emoji: string }> = {
  info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', emoji: 'ℹ️' },
  success: { bg: '#f0fdf4', border: '#22c55e', text: '#15803d', emoji: '✅' },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', emoji: '⚠️' },
  error:   { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', emoji: '🚨' },
};

/* -- 스타일 상수 -- */
const STYLES = {
  body: {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  container: {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '40px 48px',
    borderRadius: '8px',
    maxWidth: '600px',
  },
  brandName: {
    color: '#6366f1',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '24px',
  },
  heading: {
    color: '#1a1a2e',
    fontSize: '22px',
    fontWeight: '700',
    margin: '0 0 16px',
  },
  text: {
    color: '#4b5563',
    fontSize: '16px',
    lineHeight: '1.6',
    margin: '0 0 16px',
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '600',
    padding: '10px 28px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  buttonSection: {
    textAlign: 'center' as const,
    margin: '24px 0',
  },
  footer: {
    color: '#9ca3af',
    fontSize: '13px',
    textAlign: 'center' as const,
    marginTop: '32px',
  },
  hr: {
    borderColor: '#e5e7eb',
    margin: '32px 0',
  },
};

/* -- 컴포넌트 -- */
export function AlertTemplate({
  title,
  message,
  alertType = 'info',
  ctaLabel,
  ctaUrl,
  brandName = 'My Service',
  previewText,
}: AlertProps) {
  const preview = previewText ?? `[${brandName}] ${title}`;
  const color = ALERT_COLORS[alertType];

  const alertBoxStyle = {
    backgroundColor: color.bg,
    borderLeft: `4px solid ${color.border}`,
    borderRadius: '4px',
    padding: '16px 20px',
    margin: '16px 0',
  };

  const alertTitleStyle = {
    color: color.text,
    fontSize: '15px',
    fontWeight: '700' as const,
    margin: '0 0 6px',
  };

  const alertMessageStyle = {
    color: color.text,
    fontSize: '14px',
    lineHeight: '1.6',
    margin: '0',
  };

  return (
    <Html lang="ko">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={STYLES.body}>
        <Container style={STYLES.container}>
          <Text style={STYLES.brandName}>{brandName}</Text>

          <Heading style={STYLES.heading}>{title}</Heading>

          <Section style={alertBoxStyle}>
            <Text style={alertTitleStyle}>{color.emoji} {title}</Text>
            <Text style={alertMessageStyle}>{message}</Text>
          </Section>

          {ctaLabel && ctaUrl && (
            <Section style={STYLES.buttonSection}>
              <Button href={ctaUrl} style={STYLES.button}>
                {ctaLabel}
              </Button>
            </Section>
          )}

          <Hr style={STYLES.hr} />

          <Text style={STYLES.footer}>
            이 알림은 {brandName}에서 자동으로 발송되었습니다.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
