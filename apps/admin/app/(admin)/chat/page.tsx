import { getChannels } from '@/actions/chat';
import { getCurrentUser } from '@/actions/auth';
import ChatClient from './ChatClient';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const [channels, me] = await Promise.all([getChannels(), getCurrentUser()]);
  return (
    <ChatClient
      channels={channels as Channel[]}
      meId={me?.id ?? null}
      meName={me?.name ?? '나'}
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
