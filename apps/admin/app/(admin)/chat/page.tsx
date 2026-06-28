import { redirect } from 'next/navigation';
import { getChannels } from '@/actions/chat';
import { getCurrentUser } from '@/actions/auth';
import { getEnabledModules } from '@/actions/modules';
import ChatClient from './ChatClient';

export const dynamic = 'force-dynamic';

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  // 라우트 가드: chat 모듈이 꺼진 워크스페이스는 접근 차단
  const enabled = await getEnabledModules();
  if (!enabled.includes('chat')) redirect('/products');

  const { channel } = await searchParams;
  const [channels, me] = await Promise.all([getChannels(), getCurrentUser()]);
  return (
    <ChatClient
      channels={channels as Channel[]}
      meId={me?.id ?? null}
      meName={me?.name ?? '나'}
      initialChannelId={channel ?? null}
    />
  );
}

export interface Channel {
  id: string;
  name: string;
  kind: string;
  partner_name?: string | null;
  unread?: number;
}
