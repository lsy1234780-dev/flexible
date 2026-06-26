'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: string;
  headerBorder?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function ModalBase({
  open,
  onClose,
  title,
  maxWidth = 'sm:max-w-sm',
  headerBorder = true,
  children,
  footer,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`${maxWidth} p-0 gap-0`} showCloseButton>
        <DialogHeader className={`px-6 py-4${headerBorder ? ' border-b' : ''}`}>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
          {children}
        </div>

        {footer && (
          <div className="flex items-center gap-2 px-6 py-4">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
