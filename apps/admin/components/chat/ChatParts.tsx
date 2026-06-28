'use client';

// 채팅 공용 파츠 — 전체 채팅(/chat)과 미니 위젯이 함께 쓰는 메시지/작성 UI.
// (모듈화 원칙: 복제하지 않고 한 곳에서 정의해 양쪽이 import.)

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  Send, AtSign, X, SmilePlus, MessageSquare, CornerDownRight,
  ChevronLeft, Pencil, Trash2, Paperclip, FileText, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  getMentionCandidates, getMentionCategories, uploadChatFile,
  type MentionInput, type AttachmentInput,
} from '@/actions/chat';
import { entityChipClass, ENTITY_LABEL } from '@/lib/entityLink';

export const EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];

export interface Mention { entity_type: string; entity_id: string; label: string }
export interface Reaction { emoji: string; user_id: string | null }
export interface Attachment { id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null }
export interface Message {
  id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  reply_to: string | null;
  message_mentions: Mention[];
  message_reactions: Reaction[];
  message_attachments: Attachment[];
}

// ─── 첨부 파일 뷰 (서명 URL로 이미지 인라인 / 파일 다운로드) ───
function formatSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function AttachmentView({ att }: { att: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    supabase.storage.from('chat-attachments').createSignedUrl(att.storage_path, 3600)
      .then(({ data }) => { if (alive) setUrl(data?.signedUrl ?? null); });
    return () => { alive = false; };
  }, [att.storage_path]);

  const isImage = (att.mime_type ?? '').startsWith('image/');
  if (isImage) {
    return url
      ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={att.file_name} className="max-h-60 max-w-xs rounded-md border object-cover" />
        </a>
      )
      : <div className="h-32 w-48 animate-pulse rounded-md bg-gray-100" />;
  }
  return (
    <a
      href={url ?? '#'}
      target="_blank"
      rel="noreferrer"
      download={att.file_name}
      className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
    >
      <FileText size={15} className="text-gray-400" />
      <span className="max-w-48 truncate">{att.file_name}</span>
      {att.size_bytes != null && <span className="text-xs text-gray-400">{formatSize(att.size_bytes)}</span>}
      <Download size={13} className="text-gray-400" />
    </a>
  );
}

// ─── 메시지 한 줄 ───
export interface MessageItemProps {
  m: Message;
  meId: string | null;
  meName: string;
  onReact: (messageId: string, emoji: string) => void;
  onJump: (entityType: string, entityId: string) => void;
  onEdit?: (messageId: string, body: string) => Promise<boolean>;
  onDelete?: (messageId: string) => void;
  onOpenThread?: () => void;
  replyCount?: number;
}

export function MessageItem({ m, meId, meName, onReact, onJump, onEdit, onDelete, onOpenThread, replyCount = 0 }: MessageItemProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const mine = m.author_id === meId;

  async function saveEdit() {
    if (!onEdit) return;
    const ok = await onEdit(m.id, draft);
    if (ok) setEditing(false);
  }

  const agg = new Map<string, { count: number; mine: boolean }>();
  for (const r of m.message_reactions ?? []) {
    const cur = agg.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.user_id === meId) cur.mine = true;
    agg.set(r.emoji, cur);
  }

  return (
    <div className="group flex flex-col relative">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-gray-900">{mine ? meName : (m.author_name ?? '사용자')}</span>
        <span className="text-[11px] text-gray-400">{dayjs(m.created_at).format('MM.DD HH:mm')}</span>
        {m.edited_at && <span className="text-[10px] text-gray-300">(수정됨)</span>}
        <span className="ml-auto hidden group-hover:flex items-center gap-1">
          <button onClick={() => setPickerOpen((v) => !v)} className="p-1 text-gray-400 hover:text-gray-700" title="반응 추가">
            <SmilePlus size={14} />
          </button>
          {onOpenThread && (
            <button onClick={onOpenThread} className="p-1 text-gray-400 hover:text-gray-700" title="스레드로 답글">
              <CornerDownRight size={14} />
            </button>
          )}
          {mine && onEdit && (
            <button onClick={() => { setDraft(m.body); setEditing(true); }} className="p-1 text-gray-400 hover:text-gray-700" title="수정">
              <Pencil size={13} />
            </button>
          )}
          {mine && onDelete && (
            <button onClick={() => onDelete(m.id)} className="p-1 text-gray-400 hover:text-red-600" title="삭제">
              <Trash2 size={13} />
            </button>
          )}
        </span>
      </div>

      {editing ? (
        <div className="mt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            rows={2}
            autoFocus
            className="w-full resize-none rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-gray-400"
          />
          <div className="mt-1 flex items-center gap-2 text-xs">
            <button onClick={saveEdit} className="rounded bg-gray-900 px-2 py-1 text-white hover:bg-gray-800">저장</button>
            <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-700">취소</button>
            <span className="text-gray-400">Enter 저장 · Esc 취소</span>
          </div>
        </div>
      ) : (
        m.body && <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{m.body}</p>
      )}

      {m.message_attachments?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {m.message_attachments.map((a) => <AttachmentView key={a.id} att={a} />)}
        </div>
      )}

      {m.message_mentions?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {m.message_mentions.map((mn, i) => (
            <button
              key={i}
              onClick={() => onJump(mn.entity_type, mn.entity_id)}
              className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition-colors', entityChipClass(mn.entity_type))}
              title={`${ENTITY_LABEL[mn.entity_type] ?? mn.entity_type} 보기`}
            >
              <span className="opacity-60">{ENTITY_LABEL[mn.entity_type] ?? mn.entity_type}</span>
              {mn.label}
            </button>
          ))}
        </div>
      )}

      {(agg.size > 0 || pickerOpen) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {[...agg.entries()].map(([emoji, info]) => (
            <button
              key={emoji}
              onClick={() => onReact(m.id, emoji)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                info.mine ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100',
              )}
            >
              <span>{emoji}</span>
              <span className="tabular-nums">{info.count}</span>
            </button>
          ))}
          {pickerOpen && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-0.5">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => { onReact(m.id, e); setPickerOpen(false); }} className="rounded px-1 text-sm hover:bg-gray-100">
                  {e}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {onOpenThread && replyCount > 0 && (
        <button onClick={onOpenThread} className="mt-1 inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-blue-600 hover:underline">
          <MessageSquare size={12} />
          답글 {replyCount}개
        </button>
      )}
    </div>
  );
}

// ─── 작성 컴포넌트 (채널/스레드/미니위젯 공용) — 엔티티 멘션 2단 메뉴 ───
export interface ComposerProps {
  channelId: string;
  placeholder: string;
  onSend: (body: string, mentions: Mention[], attachments: AttachmentInput[]) => Promise<void> | void;
}

export function Composer({ channelId, placeholder, onSend }: ComposerProps) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState<Mention[]>([]);
  const [files, setFiles] = useState<AttachmentInput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('channelId', channelId);
      const res = await uploadChatFile(fd);
      if (res?.error) { toast.error(res.error); continue; }
      if (res.attachment) setFiles((prev) => [...prev, res.attachment]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  // 멘션 메뉴: open → (카테고리 선택) → 항목 리스트
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState<{ type: string; label: string }[] | null>(null);
  const [activeCat, setActiveCat] = useState<{ type: string; label: string } | null>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MentionInput[]>([]);

  useEffect(() => {
    if (!menuOpen || categories) return;
    getMentionCategories().then(setCategories);
  }, [menuOpen, categories]);

  useEffect(() => {
    if (!activeCat) return;
    const t = setTimeout(async () => {
      const rows = await getMentionCandidates(query, activeCat.type);
      setItems(rows);
    }, 180);
    return () => clearTimeout(t);
  }, [activeCat, query]);

  function openMenu() {
    setMenuOpen((v) => !v);
    setActiveCat(null);
    setQuery('');
    setItems([]);
  }

  function selectCategory(cat: { type: string; label: string }) {
    setActiveCat(cat);
    setQuery('');
    setItems([]);
  }

  function addMention(m: MentionInput) {
    if (!pending.some((p) => p.entity_type === m.entity_type && p.entity_id === m.entity_id)) {
      setPending((prev) => [...prev, m]);
    }
    setMenuOpen(false);
    setActiveCat(null);
    setQuery('');
    setItems([]);
  }

  async function submit() {
    if (!body.trim() && pending.length === 0 && files.length === 0) return;
    setSending(true);
    await onSend(body, pending, files);
    setSending(false);
    setBody('');
    setPending([]);
    setFiles([]);
  }

  return (
    <div className="border-t p-3 relative">
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {pending.map((m, i) => (
            <span key={i} className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs', entityChipClass(m.entity_type))}>
              <span className="opacity-60">{ENTITY_LABEL[m.entity_type] ?? m.entity_type}</span>
              {m.label}
              <button onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))} className="hover:opacity-70">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {(files.length > 0 || uploading) && (
        <div className="mb-2 flex flex-wrap gap-1">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded border bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700">
              <Paperclip size={11} className="opacity-60" />
              <span className="max-w-40 truncate">{f.file_name}</span>
              <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="hover:opacity-70">
                <X size={11} />
              </button>
            </span>
          ))}
          {uploading && <span className="text-xs text-gray-400">업로드 중…</span>}
        </div>
      )}

      {menuOpen && (
        <div className="absolute bottom-full left-3 mb-1 w-72 rounded-lg border bg-white shadow-lg overflow-hidden">
          {!activeCat ? (
            <div className="py-1">
              <p className="px-3 py-1 text-[11px] font-semibold text-gray-400">무엇을 멘션할까요?</p>
              {(categories ?? []).map((cat) => (
                <button
                  key={cat.type}
                  onClick={() => selectCategory(cat)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', entityChipClass(cat.type))}>{cat.label}</span>
                  <span className="text-gray-700">{cat.label} 멘션</span>
                </button>
              ))}
              {categories && categories.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400">멘션 가능한 모듈이 없습니다</p>
              )}
              {!categories && <p className="px-3 py-3 text-xs text-gray-400">불러오는 중…</p>}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1 border-b px-2 py-1.5">
                <button onClick={() => setActiveCat(null)} className="p-1 text-gray-400 hover:text-gray-700">
                  <ChevronLeft size={14} />
                </button>
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', entityChipClass(activeCat.type))}>{activeCat.label}</span>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`${activeCat.label} 검색…`}
                  className="flex-1 px-1 py-0.5 text-sm outline-none"
                />
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {items.map((c) => (
                  <button
                    key={`${c.entity_type}-${c.entity_id}`}
                    onClick={() => addMention(c)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                  >
                    <span className="truncate">{c.label}</span>
                  </button>
                ))}
                {items.length === 0 && (
                  <p className="px-3 py-3 text-xs text-gray-400">{query ? '결과 없음' : '항목이 없습니다'}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          title="파일 첨부"
        >
          <Paperclip size={16} />
        </button>
        <button
          onClick={openMenu}
          className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border transition-colors', menuOpen ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100')}
          title="엔티티 멘션 (거래처/딜/제품/수주 태그)"
        >
          <AtSign size={16} />
        </button>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={`${placeholder} (Enter 전송, Shift+Enter 줄바꿈)`}
          rows={1}
          className="flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
        />
        <button
          onClick={submit}
          disabled={sending}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
