/* ===== WelcomeTemplate ===== */
/* 가입 완료 웰컴 이메일 템플릿 */

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

import type { WelcomeProps } from '../../types';

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
  heroSection: {
    textAlign: 'center' as const,
    padding: '32px 0',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '8px',
    marginBottom: '32px',
  },
  heroEmoji: {
    fontSize: '48px',
    margin: '0 0 8px',
  },
  heroBrandName: {
    color: '#ffffff',
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 8px',
  },
  heroSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '16px',
    margin: '0',
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
  featureItem: {
    color: '#4b5563',
    fontSize: '15px',
    lineHeight: '1.8',
    margin: '0',
    paddingLeft: '4px',
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
export function WelcomeTemplate({
  brandName = 'My Service',
  userName,
  loginUrl,
  previewText,
}: WelcomeProps) {
  const preview = previewText ?? `${brandName}에 오신 것을 환영합니다!`;
  const greeting = userName ? `${userName}님, ` : '';

  return (
    <Html lang="ko">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={STYLES.body}>
        <Container style={STYLES.container}>
          <Section style={STYLES.heroSection}>
            <Text style={STYLES.heroEmoji}>🎉</Text>
            <Text style={STYLES.heroBrandName}>{brandName}</Text>
            <Text style={STYLES.heroSubtext}>가입을 축하드립니다!</Text>
          </Section>

          <Heading style={STYLES.heading}>
            {greeting}환영합니다!
          </Heading>

          <Text style={STYLES.text}>
            {brandName}의 새 멤버가 되어주셔서 감사합니다.
            이제 모든 기능을 자유롭게 이용하실 수 있습니다.
          </Text>

          <Text style={{ ...STYLES.text, marginBottom: '8px' }}>
            <strong>시작하기 전에 알아두면 좋은 것들:</strong>
          </Text>
          <Text style={STYLES.featureItem}>✅ 프로필을 완성하면 맞춤형 서비스를 받을 수 있습니다</Text>
          <Text style={STYLES.featureItem}>✅ 언제든지 설정에서 알림 옵션을 변경할 수 있습니다</Text>
          <Text style={STYLES.featureItem}>✅ 궁금한 점은 고객지원 채널로 문의해 주세요</Text>

          {loginUrl && (
            <Section style={STYLES.buttonSection}>
              <Button href={loginUrl} style={STYLES.button}>
                시작하기
              </Button>
            </Section>
          )}

          <Hr style={STYLES.hr} />

          <Text style={STYLES.footer}>
            이 이메일은 {brandName}에 가입하셨기 때문에 발송되었습니다.
            <br />
            앞으로도 유용한 정보를 전달해 드리겠습니다.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
