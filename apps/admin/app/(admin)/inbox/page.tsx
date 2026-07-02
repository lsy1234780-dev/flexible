import { getMyMentions, getRecordActivity } from '@/actions/chat';
import { getUrgentItems } from '@/actions/dashboard';
import { getEnabledModules } from '@/actions/modules';
import InboxClient from './InboxClient';

export const dynamic = 'force-dynamic';

// 통합 인박스 — 로그인 후 첫 화면.
// "나에게 온 멘션 + 레코드 스레드 활동 + ERP 긴급 이벤트"를 한 피드로 모은다.
// 카톡 대신 아침에 여는 화면이 되는 것이 목표 (F안).
export default async function InboxPage() {
  const enabled = await getEnabledModules();
  const chatOn = enabled.includes('chat');

  const [mentions, activity, urgent] = await Promise.all([
    chatOn ? getMyMentions(30).catch(() => []) : Promise.resolve([]),
    chatOn ? getRecordActivity(30).catch(() => []) : Promise.resolve([]),
    getUrgentItems().catch(() => []),
  ]);

  return (
    <InboxClient
      mentions={mentions}
      activity={activity}
      urgent={urgent}
      chatEnabled={chatOn}
    />
  );
}
