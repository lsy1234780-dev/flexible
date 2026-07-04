'use client';

// 채팅 공용 파츠 — 전체 채팅(/chat)과 미니 위젯이 함께 쓰는 메시지/작성 UI.
// (모듈화 원칙: 복제하지 않고 한 곳에서 정의해 양쪽이 import.)

import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  Send, AtSign, X, SmilePlus, MessageSquare,
  ChevronLeft, Pencil, Trash2, Paperclip, FileText, Download, Share2,
  ExternalLink, Loader2, Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  getMentionCandidates, getMentionCategories, uploadChatFile, getChatEntityDetails,
  type MentionInput, type AttachmentInput, type EntityDetail,
} from '@/actions/chat';
import { entityChipClass, ENTITY_LABEL } from '@/lib/entityLink';
import { PresenceBadge } from '@/components/chat/Presence';
import type { PresenceInfo } from '@/actions/presence';

export const EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];

export interface Mention { entity_type: string; entity_id: string; label: string }
export interface Reaction { emoji: string; user_id: string | null }
export interface Attachment { id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null }
export interface Message {
  id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  is_system?: boolean;   // ERP 봇 시스템 메시지 (상태 전이 자동 기록)
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
  onForward?: (msg: Message, rect: DOMRect) => void;
  replyCount?: number;
  presence?: PresenceInfo | null; // 작성자의 부재 정보 (휴가/자리비움) — 있으면 이름 옆 배지
}

export function MessageItem({ m, meId, meName, onReact, onJump, onEdit, onDelete, onOpenThread, onForward, replyCount = 0, presence = null }: MessageItemProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const mine = m.author_id === meId;

  // 시스템(ERP 봇) 메시지 — 상태 전이 자동 기록. 회색 한 줄로 컴팩트하게.
  if (m.is_system) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs text-gray-400">
        <Bot size={12} className="flex-shrink-0 text-gray-300" />
        <span className="min-w-0 break-words">{m.body}</span>
        <span className="ml-auto flex-shrink-0 text-[10px] text-gray-300">{dayjs(m.created_at).format('MM.DD HH:mm')}</span>
      </div>
    );
  }

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
        {presence && <PresenceBadge info={presence} />}
        <span className="text-[11px] text-gray-400">{dayjs(m.created_at).format('MM.DD HH:mm')}</span>
        {m.edited_at && <span className="text-[10px] text-gray-300">(수정됨)</span>}
        <span className="ml-auto hidden group-hover:flex items-center gap-1">
          <button onClick={() => setPickerOpen((v) => !v)} className="p-1 text-gray-400 hover:text-gray-700" title="반응 추가">
            <SmilePlus size={14} />
          </button>
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
          {onForward && (
            <button
              onClick={(e) => onForward(m, (e.currentTarget as HTMLButtonElement).getBoundingClientRect())}
              className="p-1 text-gray-400 hover:text-blue-600"
              title="DM으로 전달"
            >
              <Share2 size={13} />
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

      {onOpenThread && (
        // 호버로 숨기지 않고 항상 노출 — 답글 기능은 멘션 자동 상속(075)이 걸려있는 핵심 동선이라
        // 발견 못 해서 안 쓰는 게 최악. 답글 없을 땐 옅게, 있으면 파란색으로 존재감을 높인다.
        <button
          onClick={onOpenThread}
          className={cn(
            'mt-1 inline-flex w-fit items-center gap-1 rounded text-xs font-medium transition-colors',
            replyCount > 0 ? 'text-blue-600 hover:underline' : 'text-gray-400 hover:text-gray-600',
          )}
        >
          <MessageSquare size={12} />
          {replyCount > 0 ? `답글 ${replyCount}개` : '답글'}
        </button>
      )}
    </div>
  );
}

// ─── 작성 컴포넌트 (채널/스레드/미니위젯 공용) — 엔티티 멘션 2단 메뉴 ───
export interface QuotedMessage { body: string; author: string; channelName: string }

export interface ComposerProps {
  channelId: string;
  placeholder: string;
  onSend: (body: string, mentions: Mention[], attachments: AttachmentInput[]) => Promise<void> | void;
  quotedMessage?: QuotedMessage | null;
  onDismissQuote?: () => void;
}

export function Composer({ channelId, placeholder, onSend, quotedMessage, onDismissQuote }: ComposerProps) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState<Mention[]>([]);
  const [files, setFiles] = useState<AttachmentInput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // @ 인라인 트리거: textarea에서 @ 입력 시 멘션 메뉴 자동 오픈
  const [atIndex, setAtIndex] = useState<number | null>(null);

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
  const [highlightedCat, setHighlightedCat] = useState(-1);
  const [highlightedItem, setHighlightedItem] = useState(-1);
  const [atQuery, setAtQuery] = useState('');
  const filteredCats = useMemo(() => {
    if (!atQuery) return categories ?? [];
    const q = atQuery.replace(/\s/g, '').toLowerCase();
    return (categories ?? []).filter((c) => {
      // "멤버 멘션" → "멤버멘션" 으로 정규화 후 매칭
      const normalized = (c.label + '멘션').replace(/\s/g, '').toLowerCase();
      return normalized.includes(q) || c.label.replace(/\s/g, '').toLowerCase().includes(q);
    });
  }, [categories, atQuery]);
  const catListRef = useRef<HTMLDivElement>(null);
  const itemListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen || categories) return;
    getMentionCategories().then(setCategories);
  }, [menuOpen, categories]);

  useEffect(() => {
    if (!activeCat) return;
    const t = setTimeout(async () => {
      const rows = await getMentionCandidates(query, activeCat.type);
      setItems(rows);
      setHighlightedItem(-1);
    }, 180);
    return () => clearTimeout(t);
  }, [activeCat, query]);

  useEffect(() => {
    if (highlightedItem < 0 || !itemListRef.current) return;
    const el = itemListRef.current.children[highlightedItem] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedItem]);

  function openMenu() {
    setMenuOpen((v) => !v);
    setActiveCat(null);
    setQuery('');
    setItems([]);
    setAtIndex(null);
  }

  function selectCategory(cat: { type: string; label: string }) {
    setActiveCat(cat);
    setQuery('');
    setItems([]);
    setHighlightedCat(-1);
    setHighlightedItem(-1);
  }

  function closeMenu() {
    // @ 인라인 트리거로 열린 경우 → @+쿼리 텍스트 제거
    if (atIndex !== null) {
      const removeEnd = atIndex + 1 + atQuery.length; // '@' 1자 + 쿼리 길이
      setBody((prev) => prev.slice(0, atIndex) + prev.slice(removeEnd));
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(atIndex, atIndex);
          textareaRef.current.focus();
        }
      }, 0);
    }
    setMenuOpen(false);
    setActiveCat(null);
    setQuery('');
    setItems([]);
    setHighlightedCat(-1);
    setHighlightedItem(-1);
    setAtIndex(null);
    setAtQuery('');
  }

  function addMention(m: MentionInput) {
    if (!pending.some((p) => p.entity_type === m.entity_type && p.entity_id === m.entity_id)) {
      setPending((prev) => [...prev, m]);
    }
    // 인라인 @ 트리거였으면 @ + 이후 타이핑된 텍스트 제거
    if (atIndex !== null) {
      const cursor = textareaRef.current?.selectionStart ?? body.length;
      const before = body.slice(0, atIndex);
      const after = body.slice(cursor);
      setBody(before + after);
      // 커서를 @ 위치로 복원
      setTimeout(() => {
        textareaRef.current?.setSelectionRange(atIndex, atIndex);
        textareaRef.current?.focus();
      }, 0);
    }
    closeMenu();
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);

    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    // @ 뒤에 공백·줄바꿈이 없으면 인라인 트리거로 간주
    const match = /@([^\s@]*)$/.exec(before);
    if (match) {
      const idx = match.index;
      setAtIndex(idx);
      setAtQuery(match[1]);
      setHighlightedCat(-1);
      if (!menuOpen) {
        setMenuOpen(true);
        setActiveCat(null);
        setQuery('');
        setItems([]);
      }
    } else if (menuOpen && atIndex !== null) {
      // 공백 입력 또는 @ 삭제 → 메뉴 닫기
      closeMenu();
    }
  }

  async function submit() {
    if (!body.trim() && pending.length === 0 && files.length === 0 && !quotedMessage) return;
    setSending(true);
    const finalBody = quotedMessage
      ? `> [#${quotedMessage.channelName}] ${quotedMessage.author}: ${quotedMessage.body}${body.trim() ? `\n\n${body}` : ''}`
      : body;
    await onSend(finalBody, pending, files);
    setSending(false);
    setBody('');
    setPending([]);
    setFiles([]);
    onDismissQuote?.();
  }

  return (
    <div className="border-t p-3 relative">
      {quotedMessage && (
        <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-blue-400 bg-blue-50/60 px-2 py-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-blue-600 mb-0.5">
              #{quotedMessage.channelName} · {quotedMessage.author}
            </p>
            <p className="text-sm text-gray-700 line-clamp-3 whitespace-pre-wrap break-words">{quotedMessage.body}</p>
          </div>
          <button onClick={onDismissQuote} className="flex-shrink-0 mt-0.5 text-gray-400 hover:text-gray-600">
            <X size={13} />
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-0">
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
        <div
          className="absolute bottom-full left-3 mb-1 w-72 rounded-lg border bg-white shadow-lg overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              closeMenu();
              textareaRef.current?.focus();
            }
          }}
        >
          {!activeCat ? (
            <div className="py-1" ref={catListRef}>
              <p className="px-3 py-1 text-[11px] font-semibold text-gray-400">
                {atIndex !== null ? `@ 멘션${atQuery ? ` — "${atQuery}"` : ' — 무엇을 태그할까요?'}` : '무엇을 멘션할까요?'}
              </p>
              {filteredCats.map((cat, i) => (
                <button
                  key={cat.type}
                  onClick={() => selectCategory(cat)}
                  className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', highlightedCat === i ? 'bg-gray-100' : 'hover:bg-gray-100')}
                >
                  <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', entityChipClass(cat.type))}>{cat.label}</span>
                  <span className="text-gray-700">{cat.label} 멘션</span>
                </button>
              ))}
              {categories && filteredCats.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400">{atQuery ? `"${atQuery}"에 맞는 멘션 유형이 없습니다` : '멘션 가능한 모듈이 없습니다'}</p>
              )}
              {!categories && <p className="px-3 py-3 text-xs text-gray-400">불러오는 중…</p>}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1 border-b px-2 py-1.5">
                <button onClick={() => { setActiveCat(null); setHighlightedItem(-1); }} className="p-1 text-gray-400 hover:text-gray-700">
                  <ChevronLeft size={14} />
                </button>
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', entityChipClass(activeCat.type))}>{activeCat.label}</span>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setHighlightedItem(-1); }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedItem((p) => Math.min(p + 1, items.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedItem((p) => Math.max(p - 1, -1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (highlightedItem >= 0 && items[highlightedItem]) {
                        addMention(items[highlightedItem]);
                      } else if (items.length === 1) {
                        addMention(items[0]);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setActiveCat(null);
                      setHighlightedItem(-1);
                    }
                  }}
                  placeholder={`${activeCat.label} 검색…`}
                  className="flex-1 px-1 py-0.5 text-sm outline-none"
                />
              </div>
              <div ref={itemListRef} className="max-h-56 overflow-y-auto py-1">
                {items.map((c, i) => (
                  <button
                    key={`${c.entity_type}-${c.entity_id}`}
                    onClick={() => addMention(c)}
                    className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', highlightedItem === i ? 'bg-gray-100' : 'hover:bg-gray-100')}
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
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          onKeyDown={(e) => {
            if (menuOpen && !activeCat && filteredCats.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedCat((p) => Math.min(p + 1, filteredCats.length - 1));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedCat((p) => Math.max(p - 1, 0));
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (highlightedCat >= 0) {
                  selectCategory(filteredCats[highlightedCat]);
                } else if (filteredCats.length === 1) {
                  selectCategory(filteredCats[0]);
                }
                return;
              }
            }
            if (e.key === 'Escape' && menuOpen) { e.preventDefault(); closeMenu(); return; }
            if (e.key === 'Enter' && !e.shiftKey && !menuOpen) { e.preventDefault(); submit(); }
          }}
          placeholder={`${placeholder} (Enter 전송, Shift+Enter 줄바꿈, @ 멘션)`}
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

// ─── 맥락 패널 ───
// 현재 채널 메시지에서 언급된 엔티티를 수집해 실시간 정보를 보여준다.

export interface ContextPanelProps {
  messages: Message[];
  onClose: () => void;
}

export function ContextPanel({ messages, onClose }: ContextPanelProps) {
  // 전체 메시지에서 고유 멘션 수집 (렌더 파생값 — effect에서 동기 setState 금지)
  const unique = useMemo(() => {
    const seen = new Set<string>();
    const arr: { entity_type: string; entity_id: string; label: string }[] = [];
    for (const m of messages) {
      for (const mn of m.message_mentions ?? []) {
        const key = `${mn.entity_type}:${mn.entity_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          arr.push(mn);
        }
      }
    }
    return arr;
  }, [messages]);

  const [fetched, setFetched] = useState<EntityDetail[] | null>(null);

  useEffect(() => {
    if (unique.length === 0) return;
    let alive = true;
    getChatEntityDetails(unique).then((d) => { if (alive) setFetched(d); });
    return () => { alive = false; };
  }, [unique]);

  const details = unique.length === 0 ? [] : (fetched ?? []);
  const loading = unique.length > 0 && fetched === null;

  // entity_type별로 그룹핑
  const grouped = new Map<string, EntityDetail[]>();
  for (const d of details) {
    const cur = grouped.get(d.entity_type) ?? [];
    cur.push(d);
    grouped.set(d.entity_type, cur);
  }

  const typeLabel: Record<string, string> = {
    company: '거래처', order: '수주', quotation: '견적', product: '제품',
    as: 'A/S', deal: '딜', receiving: '입고', warehouse: '창고', user: '멤버',
  };

  return (
    <aside className="w-72 flex-shrink-0 border-l flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 h-12 border-b">
        <span className="text-sm font-semibold text-gray-700">이 대화의 맥락</span>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={16} className="animate-spin mr-2" />
            <span className="text-sm">불러오는 중…</span>
          </div>
        )}

        {!loading && details.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">언급된 레코드가 없습니다.</p>
            <p className="text-xs text-gray-300 mt-1">@ 버튼으로 거래처·수주 등을 태그하면 여기 표시됩니다.</p>
          </div>
        )}

        {!loading && [...grouped.entries()].map(([type, items]) => (
          <div key={type}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {typeLabel[type] ?? type}
            </p>
            <div className="space-y-1.5">
              {items.map((item) => (
                <a
                  key={item.entity_id}
                  href={item.href}
                  className="flex items-start justify-between gap-2 rounded-lg border bg-gray-50 px-3 py-2 hover:bg-gray-100 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.label}</p>
                    {item.info && (
                      <p className="text-xs text-gray-500 mt-0.5">{item.info}</p>
                    )}
                  </div>
                  <ExternalLink size={12} className="flex-shrink-0 mt-1 text-gray-300 group-hover:text-gray-500" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
