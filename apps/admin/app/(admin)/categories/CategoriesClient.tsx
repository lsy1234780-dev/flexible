'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, FolderOpen, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { createCategory, updateCategory, deleteCategory } from '@/actions/categories';
import type { Category } from '@/types/database';

interface Props {
  categories: Category[];
  productCounts: Record<string, number>;
}

interface TreeNode extends Category {
  children: TreeNode[];
  depth: number;
}

function buildTree(categories: Category[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // 노드 초기화
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [], depth: 0 });
  }

  // 트리 구성
  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parent_id && map.has(cat.parent_id)) {
      const parent = map.get(cat.parent_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[], depth: number) {
    for (const node of list) {
      node.depth = depth;
      result.push(node);
      walk(node.children, depth + 1);
    }
  }
  walk(nodes, 0);
  return result;
}

// 특정 카테고리의 자손 ID 목록 (자기 자신 + 하위 전부)
function getDescendantIds(categories: Category[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const cat of categories) {
      if (cat.parent_id && ids.has(cat.parent_id) && !ids.has(cat.id)) {
        ids.add(cat.id);
        changed = true;
      }
    }
  }
  return ids;
}

export default function CategoriesClient({ categories, productCounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(categories.map(c => c.id)));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('none');

  const tree = buildTree(categories);
  const flat = flattenTree(tree);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 표시할 노드 필터 (접힌 부모의 자식은 숨김)
  const visible = flat.filter(node => {
    if (node.depth === 0) return true;
    // 모든 조상이 expanded 상태인지 확인
    let current = node;
    while (current.parent_id) {
      if (!expanded.has(current.parent_id)) return false;
      const parent = flat.find(n => n.id === current.parent_id);
      if (!parent) break;
      current = parent;
    }
    return true;
  });

  function openCreate(parentIdValue?: string) {
    setEditTarget(null);
    setName('');
    setParentId(parentIdValue ?? 'none');
    setDialogOpen(true);
  }

  function openEdit(cat: Category) {
    setEditTarget(cat);
    setName(cat.name);
    setParentId(cat.parent_id ?? 'none');
    setDialogOpen(true);
  }

  function handleSubmit() {
    const pid = parentId === 'none' ? null : parentId;
    startTransition(async () => {
      const result = editTarget
        ? await updateCategory(editTarget.id, name, pid)
        : await createCategory(name, pid);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(editTarget ? '수정되었습니다' : '카테고리가 추가되었습니다');
        setDialogOpen(false);
        router.refresh();
      }
    });
  }

  function handleDelete(cat: Category) {
    if (!confirm(`"${cat.name}" 카테고리를 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const result = await deleteCategory(cat.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('삭제되었습니다');
        router.refresh();
      }
    });
  }

  // 부모 선택 시 자기 자신 + 하위 제외
  const parentOptions = editTarget
    ? categories.filter(c => !getDescendantIds(categories, editTarget.id).has(c.id))
    : categories;

  // 부모 옵션에 depth 표시용
  const parentFlat = flattenTree(buildTree(parentOptions));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">카테고리</h1>
        <Button onClick={() => openCreate()} size="sm">
          <Plus size={16} />
          카테고리 추가
        </Button>
      </div>

      {/* 트리 목록 */}
      <div className="rounded-lg border bg-white overflow-hidden divide-y">
        {visible.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            등록된 카테고리가 없습니다
          </div>
        ) : (
          visible.map((node) => {
            const hasChildren = node.children.length > 0;
            const isExpanded = expanded.has(node.id);

            return (
              <div
                key={node.id}
                className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                style={{ paddingLeft: `${node.depth * 28 + 16}px` }}
              >
                {/* 펼침/접힘 토글 */}
                <button
                  onClick={() => toggleExpand(node.id)}
                  className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
                >
                  {hasChildren ? (
                    isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                  ) : (
                    <span className="w-4" />
                  )}
                </button>

                {/* 아이콘 */}
                {hasChildren && isExpanded ? (
                  <FolderOpen size={18} className="text-amber-500 shrink-0" />
                ) : (
                  <Folder size={18} className="text-gray-400 shrink-0" />
                )}

                {/* 이름 + 제품 수 */}
                <span className="flex-1 text-sm font-medium text-gray-800 flex items-center gap-2">
                  {node.name}
                  <Link
                    href={`/products?category=${node.id}`}
                    className="text-xs text-gray-400 hover:text-blue-500 hover:underline transition-colors"
                    title="이 카테고리의 제품 보기"
                  >
                    {productCounts[node.id] ?? 0}개
                  </Link>
                </span>

                {/* 액션 버튼 */}
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openCreate(node.id)}
                    title="하위 카테고리 추가"
                  >
                    <Plus size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(node)}
                    title="수정"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(node)}
                    disabled={isPending}
                    title="삭제"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? '카테고리 수정' : '카테고리 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>카테고리명</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예) 음료, 과자류"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>상위 카테고리</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="없음 (최상위)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">없음 (최상위)</SelectItem>
                  {parentFlat.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {'　'.repeat(cat.depth)}{cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSubmit} disabled={isPending || !name.trim()} className="w-full">
              {editTarget ? '수정' : '추가'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
