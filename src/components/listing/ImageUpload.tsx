import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Image as ImageIcon, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  folder: string;
  label?: string;
  /** When true, also shows a "Take Photo" tile that opens the device camera on mobile. */
  allowCamera?: boolean;
}

const ImageUpload = ({
  images,
  onImagesChange,
  maxImages = 5,
  folder,
  label = "Upload Images",
  allowCamera = false,
}: ImageUploadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      toast({
        title: "Maximum images reached",
        description: `You can only upload ${maxImages} images`,
        variant: "destructive",
      });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setIsUploading(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of filesToUpload) {
        // Validate file type
        if (!file.type.startsWith("image/")) {
          toast({
            title: "Invalid file type",
            description: "Please upload only image files",
            variant: "destructive",
          });
          continue;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: "Images must be less than 5MB",
            variant: "destructive",
          });
          continue;
        }

        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("listing-images")
          .upload(fileName, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from("listing-images")
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrlData.publicUrl);
      }

      onImagesChange([...images, ...uploadedUrls]);

      if (uploadedUrls.length > 0) {
        toast({
          title: "Images uploaded",
          description: `${uploadedUrls.length} image(s) uploaded successfully`,
        });
      }
    } catch (error: any) {
      console.error("Error uploading images:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload images",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveImage = async (urlToRemove: string) => {
    try {
      // Extract the path from the URL
      const url = new URL(urlToRemove);
      const pathParts = url.pathname.split("/storage/v1/object/public/listing-images/");
      if (pathParts.length > 1) {
        const filePath = pathParts[1];
        await supabase.storage.from("listing-images").remove([filePath]);
      }

      onImagesChange(images.filter((url) => url !== urlToRemove));
    } catch (error) {
      console.error("Error removing image:", error);
      // Still remove from UI even if storage deletion fails
      onImagesChange(images.filter((url) => url !== urlToRemove));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {images.length}/{maxImages} images
        </span>
      </div>

      {/* Image Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((url, index) => (
          <div
            key={url}
            className="relative aspect-square rounded-lg overflow-hidden border bg-muted"
          >
            <img
              src={url}
              alt={`Upload ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemoveImage(url)}
              className="absolute top-2 right-2 p-1 bg-background/80 rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        {/* Upload Button */}
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={cn(
              "aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors",
              isUploading
                ? "border-muted cursor-not-allowed"
                : "border-border hover:border-primary hover:bg-primary/5 cursor-pointer"
            )}
          >
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Add Photo</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <p className="text-xs text-muted-foreground">
        Supported: JPG, PNG, WebP. Max 5MB each.
      </p>
    </div>
  );
};

export default ImageUpload;
