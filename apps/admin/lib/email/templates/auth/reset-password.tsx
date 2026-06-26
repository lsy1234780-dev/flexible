/* ===== ResetPasswordTemplate ===== */
/* 비밀번호 재설정 이메일 템플릿 */

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

import type { ResetPasswordProps } from '../../types';

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
    backgroundColor: '#ef4444',
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
  warningBox: {
    backgroundColor: '#fef2f2',
    borderLeft: '4px solid #ef4444',
    borderRadius: '4px',
    padding: '12px 16px',
    margin: '16px 0',
  },
  warningText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: '0',
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
export function ResetPasswordTemplate({
  resetUrl,
  brandName = 'My Service',
  userEmail,
  expiresInMinutes = 60,
  previewText,
}: ResetPasswordProps) {
  const preview = previewText ?? `${brandName} 비밀번호 재설정 안내입니다.`;
  const expiresText = expiresInMinutes >= 60
    ? `${expiresInMinutes / 60}시간`
    : `${expiresInMinutes}분`;

  return (
    <Html lang="ko">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={STYLES.body}>
        <Container style={STYLES.container}>
          <Text style={STYLES.brandName}>{brandName}</Text>

          <Heading style={STYLES.heading}>비밀번호 재설정 안내</Heading>

          <Text style={STYLES.text}>
            안녕하세요{userEmail ? ` (${userEmail})` : ''}!
          </Text>
          <Text style={STYLES.text}>
            비밀번호 재설정 요청이 접수되었습니다.
            아래 버튼을 클릭해서 새 비밀번호를 설정하세요.
          </Text>

          <Section style={STYLES.warningBox}>
            <Text style={STYLES.warningText}>
              ⚠️ 이 링크는 <strong>{expiresText}</strong> 후에 만료됩니다.
              요청하지 않으셨다면 즉시 이 이메일을 무시하세요.
            </Text>
          </Section>

          <Section style={STYLES.buttonSection}>
            <Button href={resetUrl} style={STYLES.button}>
              비밀번호 재설정
            </Button>
          </Section>

          <Text style={STYLES.urlText}>
            버튼이 작동하지 않으면 아래 링크를 브라우저에 복사해서 사용하세요:
          </Text>
          <Link href={resetUrl} style={{ ...STYLES.urlText, color: '#6366f1' }}>
            {resetUrl}
          </Link>

          <Hr style={STYLES.hr} />

          <Text style={STYLES.footer}>
            비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시하세요.
            계정에 무단 접근이 의심되면 즉시 지원팀에 연락하세요.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
