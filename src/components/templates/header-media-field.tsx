'use client';

import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { FileText, ImageIcon, Loader2, Upload, Video, X } from 'lucide-react';
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { HeaderFormat } from './template-form';

const CHAT_MEDIA_BUCKET = 'chat-media';

const ACCEPT: Record<'image' | 'video' | 'document', string> = {
  image: 'image/jpeg,image/png',
  video: 'video/mp4,video/3gpp',
  document: 'application/pdf',
};

const ALLOWED: Record<'image' | 'video' | 'document', string[]> = {
  image: ['image/jpeg', 'image/png'],
  video: ['video/mp4', 'video/3gpp'],
  document: ['application/pdf'],
};

export function HeaderMediaField({
  format,
  url,
  onUrlChange,
  disabled,
}: {
  format: Extract<HeaderFormat, 'image' | 'video' | 'document'>;
  url: string;
  onUrlChange: (url: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!ALLOWED[format].includes(file.type)) {
      toast.error(
        format === 'image'
          ? 'Header image must be a JPEG or PNG.'
          : format === 'video'
            ? 'Header video must be MP4 or 3GPP.'
            : 'Header document must be a PDF.',
      );
      return;
    }
    const max =
      format === 'document'
        ? MEDIA_MAX_BYTES_BY_KIND.document
        : MEDIA_MAX_BYTES_BY_KIND[format];
    if (file.size > max) {
      toast.error(
        `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — limit is ${max / 1024 / 1024} MB.`,
      );
      return;
    }
    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
      onUrlChange(publicUrl);
      toast.success(
        format === 'image'
          ? 'Image uploaded.'
          : format === 'video'
            ? 'Video uploaded.'
            : 'Document uploaded.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const Icon =
    format === 'image' ? ImageIcon : format === 'video' ? Video : FileText;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border/80 bg-muted/20',
          (disabled || uploading) && 'opacity-60',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <Icon className="h-8 w-8 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          Drag & drop or{' '}
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="text-xs text-muted-foreground">
          {format === 'image' && 'JPEG or PNG, ≤5 MB · ≥800×418 recommended'}
          {format === 'video' && 'MP4 / 3GPP, ≤16 MB, ≤60 seconds'}
          {format === 'document' && 'PDF, ≤16 MB (storage cap)'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[format]}
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleFile(f);
          }}
        />
      </div>

      {url && format === 'image' ? (
        <div className="relative overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Header preview"
            className="max-h-48 w-full object-cover"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 h-8 w-8"
            disabled={disabled}
            onClick={() => onUrlChange('')}
            aria-label="Remove header image"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {url && format !== 'image' ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{url}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            disabled={disabled}
            onClick={() => onUrlChange('')}
            aria-label="Clear media URL"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="header-media-url">Or paste a public HTTPS URL</Label>
        <div className="flex gap-2">
          <Input
            id="header-media-url"
            value={url}
            disabled={disabled || uploading}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder={`https://… (public ${format} link)`}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            aria-label="Upload file"
          >
            <Upload className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
