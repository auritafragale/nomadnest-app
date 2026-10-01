import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/** A bottom sheet on phone and a centred dialog from tablet up. */
const ResponsiveSheet = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "max-w-[560px]",
  fullHeight = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Read by screen readers only. */
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  /** Phone: fill the screen height (the Apply sheet). */
  fullHeight?: boolean;
}) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn(fullHeight ? "h-[96dvh]" : "max-h-[92dvh]")}>
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-[26px] font-normal">{title}</DrawerTitle>
            <DrawerDescription className="sr-only">{description}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[88vh] flex-col gap-0 p-0", width)}>
        <DialogHeader className="px-6 pb-3 pt-6 text-left">
          <DialogTitle className="font-display text-[26px] font-normal">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="border-t border-border px-6 py-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
};

export default ResponsiveSheet;
