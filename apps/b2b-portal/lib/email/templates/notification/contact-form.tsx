/* ===== ContactFormTemplate ===== */
/* 문의 폼 접수 알림 이메일 템플릿 */
/* 수신자: 회사 내부 이메일 / Reply-To: 문의자 이메일 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from '@react-email/components';

import type { ContactFormProps } from '../../types';

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
  badge: {
    backgroundColor: '#6366f1',
    borderRadius: '4px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 10px',
    marginBottom: '20px',
    letterSpacing: '0.05em',
  },
  heading: {
    color: '#1a1a2e',
    fontSize: '22px',
    fontWeight: '700',
    margin: '0 0 24px',
  },
  metaBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '20px 24px',
    marginBottom: '24px',
  },
  metaRow: {
    marginBottom: '10px',
  },
  metaLabel: {
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    margin: '0 0 2px',
    width: '100px',
  },
  metaValue: {
    color: '#1e293b',
    fontSize: '15px',
    margin: '0',
    fontWeight: '500',
  },
  metaLink: {
    color: '#6366f1',
    fontSize: '15px',
    textDecoration: 'none',
    fontWeight: '500',
  },
  messageBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderLeft: '4px solid #6366f1',
    borderRadius: '4px',
    padding: '20px 24px',
    marginBottom: '24px',
  },
  messageLabel: {
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    margin: '0 0 12px',
  },
  messageText: {
    color: '#1e293b',
    fontSize: '15px',
    lineHeight: '1.7',
    margin: '0',
    whiteSpace: 'pre-wrap' as const,
  },
  replyHint: {
    backgroundColor: '#eff6ff',
    borderRadius: '6px',
    padding: '12px 16px',
    marginBottom: '24px',
  },
  replyHintText: {
    color: '#1d4ed8',
    fontSize: '13px',
    margin: '0',
  },
  footer: {
    color: '#94a3b8',
    fontSize: '12px',
    textAlign: 'center' as const,
    marginTop: '8px',
  },
  hr: {
    borderColor: '#e2e8f0',
    margin: '24px 0',
  },
};

/* -- 날짜 포맷 헬퍼 -- */
function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Seoul',
    });
  } catch {
    return isoString;
  }
}

/* -- 컴포넌트 -- */
export function ContactFormTemplate({
  senderName,
  senderEmail,
  subject,
  message,
  phone,
  category,
  submittedAt,
  brandName = 'My Service',
  previewText,
}: ContactFormProps) {
  const preview = previewText ?? `[문의] ${senderName}님으로부터 새 문의가 접수되었습니다.`;
  const displayTime = submittedAt ? formatDate(submittedAt) : formatDate(new Date().toISOString());

  return (
    <Html lang="ko">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={STYLES.body}>
        <Container style={STYLES.container}>
          <Text style={STYLES.badge}>새 문의 접수</Text>

          <Heading style={STYLES.heading}>{subject}</Heading>

          {/* -- 문의자 정보 -- */}
          <Section style={STYLES.metaBox}>
            <Row style={STYLES.metaRow}>
              <Column style={STYLES.metaLabel}>이름</Column>
              <Column>
                <Text style={STYLES.metaValue}>{senderName}</Text>
              </Column>
            </Row>
            <Row style={STYLES.metaRow}>
              <Column style={STYLES.metaLabel}>이메일</Column>
              <Column>
                <Link href={`mailto:${senderEmail}`} style={STYLES.metaLink}>
                  {senderEmail}
                </Link>
              </Column>
            </Row>
            {phone && (
              <Row style={STYLES.metaRow}>
                <Column style={STYLES.metaLabel}>연락처</Column>
                <Column>
                  <Text style={STYLES.metaValue}>{phone}</Text>
                </Column>
              </Row>
            )}
            {category && (
              <Row style={STYLES.metaRow}>
                <Column style={STYLES.metaLabel}>문의 유형</Column>
                <Column>
                  <Text style={STYLES.metaValue}>{category}</Text>
                </Column>
              </Row>
            )}
            <Row>
              <Column style={STYLES.metaLabel}>접수 시각</Column>
              <Column>
                <Text style={STYLES.metaValue}>{displayTime}</Text>
              </Column>
            </Row>
          </Section>

          {/* -- 문의 내용 -- */}
          <Section style={STYLES.messageBox}>
            <Text style={STYLES.messageLabel}>문의 내용</Text>
            <Text style={STYLES.messageText}>{message}</Text>
          </Section>

          {/* -- Reply-To 안내 -- */}
          <Section style={STYLES.replyHint}>
            <Text style={STYLES.replyHintText}>
              💡 이 이메일에 <strong>회신(Reply)</strong>하면{' '}
              <Link href={`mailto:${senderEmail}`} style={{ color: '#1d4ed8' }}>
                {senderEmail}
              </Link>
              으로 바로 답장됩니다.
            </Text>
          </Section>

          <Hr style={STYLES.hr} />

          <Text style={STYLES.footer}>
            이 메일은 {brandName} 문의 폼에서 자동 발송되었습니다.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
