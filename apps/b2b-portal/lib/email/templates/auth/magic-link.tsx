/* ===== MagicLinkTemplate ===== */
/* Magic Link 로그인 이메일 템플릿 */

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

import type { MagicLinkProps } from '../../types';

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
  expiryBox: {
    backgroundColor: '#fef3c7',
    borderRadius: '6px',
    padding: '12px 16px',
    margin: '16px 0',
  },
  expiryText: {
    color: '#92400e',
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
export function MagicLinkTemplate({
  magicUrl,
  brandName = 'My Service',
  userEmail,
  expiresInMinutes = 10,
  previewText,
}: MagicLinkProps) {
  const preview = previewText ?? `${brandName} 로그인 링크가 도착했습니다.`;

  return (
    <Html lang="ko">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={STYLES.body}>
        <Container style={STYLES.container}>
          <Text style={STYLES.brandName}>{brandName}</Text>

          <Heading style={STYLES.heading}>로그인 링크가 도착했습니다</Heading>

          <Text style={STYLES.text}>
            안녕하세요{userEmail ? ` (${userEmail})` : ''}!
          </Text>
          <Text style={STYLES.text}>
            아래 버튼을 클릭하면 비밀번호 없이 바로 로그인됩니다.
          </Text>

          <Section style={STYLES.expiryBox}>
            <Text style={STYLES.expiryText}>
              ⏱ 이 링크는 <strong>{expiresInMinutes}분</strong> 후에 만료됩니다.
            </Text>
          </Section>

          <Section style={STYLES.buttonSection}>
            <Button href={magicUrl} style={STYLES.button}>
              로그인하기
            </Button>
          </Section>

          <Text style={STYLES.urlText}>
            버튼이 작동하지 않으면 아래 링크를 브라우저에 복사해서 사용하세요:
          </Text>
          <Link href={magicUrl} style={{ ...STYLES.urlText, color: '#6366f1' }}>
            {magicUrl}
          </Link>

          <Hr style={STYLES.hr} />

          <Text style={STYLES.footer}>
            로그인을 요청하지 않으셨다면 이 이메일을 무시하세요.
            계정은 안전하게 보호되고 있습니다.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
