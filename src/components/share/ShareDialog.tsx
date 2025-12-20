import { useState } from "react";
import { Share2, Copy, Check, Twitter, Facebook, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface ShareDialogProps {
  title: string;
  url?: string;
  description?: string;
  triggerClassName?: string;
}

export const ShareDialog = ({ title, url, description, triggerClassName }: ShareDialogProps) => {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || window.location.href;
  const shareText = description || title;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const shareOnTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      "_blank"
    );
  };

  const shareOnFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      "_blank"
    );
  };

  const shareOnLinkedIn = () => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
      "_blank"
    );
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or error
      }
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className={triggerClassName}>
          <Share2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 bg-transparent text-sm outline-none truncate"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={shareOnTwitter}
              className="h-12 w-12"
            >
              <Twitter className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={shareOnFacebook}
              className="h-12 w-12"
            >
              <Facebook className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={shareOnLinkedIn}
              className="h-12 w-12"
            >
              <Linkedin className="h-5 w-5" />
            </Button>
          </div>

          {navigator.share && (
            <Button onClick={handleNativeShare} className="w-full">
              <Share2 className="h-4 w-4 mr-2" />
              More sharing options
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
