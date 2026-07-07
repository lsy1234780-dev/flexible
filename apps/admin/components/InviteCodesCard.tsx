'use client';

import { useState, useTransition } from 'react';
import { createInvite, revokeInvite, type WorkspaceInvite } from '@/actions/invites';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Ban, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

// 워크스페이스 초대코드 관리 — 직원이 /join 에서 이 코드로 합류한다.
interface Props {
  invites: WorkspaceInvite[];
  joinUrl: string; // 예: https://app.example.com/join
}

function inviteStatus(inv: WorkspaceInvite): { label: string; active: boolean } {
  if (inv.revoked_at) return { label: '회수됨', active: false };
  if (new Date(inv.expires_at) < new Date()) return { label: '만료', active: false };
  if (inv.max_uses !== null && inv.used_count >= inv.max_uses) return { label: '소진', active: false };
  return { label: '사용 가능', active: true };
}

export default function InviteCodesCard({ invites, joinUrl }: Props) {
  const router = useRouter();
  const [expiresDays, setExpiresDays] = useState(7);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError('');
    startTransition(async () => {
      const result = await createInvite({ expiresDays, maxUses: null });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRevoke(id: string) {
    setError('');
    startTransition(async () => {
      const result = await revokeInvite(id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  async function handleCopy(code: string) {
    // 코드만이 아니라 "합류 링크 + 코드" 를 복사 — 받은 직원이 바로 따라할 수 있게
    await navigator.clipboard.writeText(`${joinUrl} 에 접속해서 초대코드 ${code} 를 입력하세요.`);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">직원 초대코드</CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            직원이 <span className="font-mono text-xs">{joinUrl}</span> 에서 코드를 입력하면 이 워크스페이스에 합류합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={expiresDays}
            onChange={(e) => setExpiresDays(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value={7}>7일 유효</option>
            <option value={30}>30일 유효</option>
          </select>
          <Button size="sm" onClick={handleCreate} disabled={isPending}>
            <Plus className="mr-1 h-4 w-4" />
            발급
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        {invites.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">발급된 초대코드가 없습니다.</p>
        ) : (
          <ul className="divide-y">
            {invites.map((inv) => {
              const status = inviteStatus(inv);
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="font-mono text-sm font-semibold tracking-wider">{inv.code}</span>
                  <Badge variant={status.active ? 'default' : 'secondary'}>{status.label}</Badge>
                  <span className="text-xs text-gray-400">
                    ~{new Date(inv.expires_at).toLocaleDateString('ko-KR')} · {inv.used_count}명 합류
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {status.active && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleCopy(inv.code)} title="복사">
                          {copied === inv.code ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv.id)} disabled={isPending} title="회수">
                          <Ban className="h-4 w-4 text-red-500" />
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
