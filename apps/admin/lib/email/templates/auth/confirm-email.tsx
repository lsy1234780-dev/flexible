/* ===== ConfirmEmailTemplate ===== */
/* 회원가입 이메일 확인 템플릿 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

import type { ConfirmEmailProps } from '../../types';

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
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '32px',
  },
  heading: {
    color: '#1a1a2e',
    fontSize: '24px',
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
    fontSize: '16px',
    fontWeight: '600',
    padding: '12px 32px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  buttonSection: {
    textAlign: 'center' as const,
    margin: '32px 0',
  },
  urlText: {
    color: '#9ca3af',
    fontSize: '13px',
    wordBreak: 'break-all' as const,
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
export function ConfirmEmailTemplate({
  confirmUrl,
  brandName = 'My Service',
  userEmail,
  previewText,
}: ConfirmEmailProps) {
  const preview = previewText ?? `${brandName} 이메일 주소 확인 요청입니다.`;

  return (
    <Html lang="ko">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={STYLES.body}>
        <Container style={STYLES.container}>
          <Text style={STYLES.brandName}>{brandName}</Text>

          <Heading style={STYLES.heading}>이메일 주소를 확인해 주세요</Heading>

          <Text style={STYLES.text}>안녕하세요{userEmail ? ` (${userEmail})` : ''}!</Text>
          <Text style={STYLES.text}>
            아래 버튼을 클릭하면 이메일 주소가 확인되고 가입이 완료됩니다.
            버튼은 <strong>24시간</strong> 동안만 유효합니다.
          </Text>

          <Section style={STYLES.buttonSection}>
            <Button href={confirmUrl} style={STYLES.button}>
              이메일 확인하기
            </Button>
          </Section>

          <Text style={STYLES.urlText}>
            버튼이 작동하지 않으면 아래 링크를 브라우저에 복사해서 사용하세요:
          </Text>
          <Link href={confirmUrl} style={{ ...STYLES.urlText, color: '#6366f1' }}>
            {confirmUrl}
          </Link>

          <Hr style={STYLES.hr} />

          <Text style={STYLES.footer}>
            이 이메일은 {brandName}에서 발송되었습니다.
            가입을 요청하지 않으셨다면 이 이메일을 무시하세요.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
