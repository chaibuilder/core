"use client";

import type { ChatStatus, FileUIPart } from "ai";
import {
  Check,
  CornerDownLeftIcon,
  ImageIcon,
  MicIcon,
  PaperclipIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  type ChangeEvent,
  type ChangeEventHandler,
  Children,
  type ClipboardEventHandler,
  type ComponentProps,
  createContext,
  type FormEvent,
  type FormEventHandler,
  Fragment,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ChaiImage } from "~/builder/core/components/shared";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "~/builder/pages/components/ui/input-group";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "~/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "~/components/ui/hover-card";
import { Loading } from "~/components/ui/loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { cn } from "~/lib/utils";

// ============================================================================
// Provider Context & Types
// ============================================================================

export type AttachmentsContext = {
  files: (FileUIPart & { id: string; size?: number })[];
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  clear: () => void;
  openFileDialog: (accept?: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
};

export type TextInputContext = {
  value: string;
  setInput: (v: string) => void;
  clear: () => void;
};

export type PromptInputControllerProps = {
  textInput: TextInputContext;
  attachments: AttachmentsContext;
  /** INTERNAL: Allows PromptInput to register its file textInput + "open" callback */
  __registerFileInput: (ref: RefObject<HTMLInputElement | null>, open: () => void) => void;
};

const PromptInputController = createContext<PromptInputControllerProps | null>(null);
const ProviderAttachmentsContext = createContext<AttachmentsContext | null>(null);

export const usePromptInputController = () => {
  const ctx = useContext(PromptInputController);
  if (!ctx) {
    throw new Error("Wrap your component inside <PromptInputProvider> to use usePromptInputController().");
  }
  return ctx;
};

// Optional variants (do NOT throw). Useful for dual-mode components.
const useOptionalPromptInputController = () => useContext(PromptInputController);

export const useProviderAttachments = () => {
  const ctx = useContext(ProviderAttachmentsContext);
  if (!ctx) {
    throw new Error("Wrap your component inside <PromptInputProvider> to use useProviderAttachments().");
  }
  return ctx;
};

const useOptionalProviderAttachments = () => useContext(ProviderAttachmentsContext);

export type PromptInputProviderProps = PropsWithChildren<{
  initialInput?: string;
}>;

/**
 * Optional global provider that lifts PromptInput state outside of PromptInput.
 * If you don't use it, PromptInput stays fully self-managed.
 */
export function PromptInputProvider({ initialInput: initialTextInput = "", children }: PromptInputProviderProps) {
  // ----- textInput state
  const [textInput, setTextInput] = useState(initialTextInput);
  const clearInput = useCallback(() => setTextInput(""), []);

  // ----- attachments state (global when wrapped)
  const [attachmentFiles, setAttachmentFiles] = useState<(FileUIPart & { id: string; size?: number })[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const openRef = useRef<() => void>(() => {});

  const add = useCallback((files: File[] | FileList) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) {
      return;
    }

    setAttachmentFiles((prev) =>
      prev.concat(
        incoming.map((file) => ({
          id: nanoid(),
          type: "file" as const,
          url: URL.createObjectURL(file),
          mediaType: file.type,
          filename: file.name,
          size: file.size,
        })),
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setAttachmentFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found?.url) {
        URL.revokeObjectURL(found.url);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setAttachmentFiles((prev) => {
      for (const f of prev) {
        if (f.url) {
          URL.revokeObjectURL(f.url);
        }
      }
      return [];
    });
  }, []);

  const openFileDialog = useCallback((customAccept?: string) => {
    if (customAccept && fileInputRef.current) {
      fileInputRef.current.accept = customAccept;
    }
    openRef.current?.();
  }, []);

  const attachments = useMemo<AttachmentsContext>(
    () => ({
      files: attachmentFiles,
      add,
      remove,
      clear,
      openFileDialog,
      fileInputRef,
    }),
    [attachmentFiles, add, remove, clear, openFileDialog],
  );

  const __registerFileInput = useCallback((ref: RefObject<HTMLInputElement | null>, open: () => void) => {
    fileInputRef.current = ref.current;
    openRef.current = open;
  }, []);

  const controller = useMemo<PromptInputControllerProps>(
    () => ({
      textInput: {
        value: textInput,
        setInput: setTextInput,
        clear: clearInput,
      },
      attachments,
      __registerFileInput,
    }),
    [textInput, clearInput, attachments, __registerFileInput],
  );

  return (
    <PromptInputController.Provider value={controller}>
      <ProviderAttachmentsContext.Provider value={attachments}>{children}</ProviderAttachmentsContext.Provider>
    </PromptInputController.Provider>
  );
}

// ============================================================================
// Component Context & Hooks
// ============================================================================

const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);

export const usePromptInputAttachments = () => {
  // Dual-mode: prefer provider if present, otherwise use local
  const provider = useOptionalProviderAttachments();
  const local = useContext(LocalAttachmentsContext);
  const context = provider ?? local;
  if (!context) {
    throw new Error("usePromptInputAttachments must be used within a PromptInput or PromptInputProvider");
  }
  return context;
};

export type PromptInputAttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: FileUIPart & { id: string; size?: number };
  className?: string;
};

export function PromptInputAttachment({ data, className, ...props }: PromptInputAttachmentProps) {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();

  const filename = data.filename || "";

  const mediaType = data.mediaType?.startsWith("image/") && data.url ? "image" : "file";
  const isImage = mediaType === "image";

  const attachmentLabel = filename || (isImage ? t("Image") : t("Attachment"));

  return (
    <PromptInputHoverCard>
      <HoverCardTrigger asChild className="max-w-36">
        <div
          className={cn(
            "group relative flex h-6 cursor-default select-none items-center gap-1.5 rounded-md border border-border px-1 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
            className,
          )}
          key={data.id}
          {...props}>
          <div className="relative size-4 shrink-0">
            <div className="bg-surface absolute inset-0 flex size-4 items-center justify-center overflow-hidden rounded transition-opacity group-hover:opacity-0">
              {isImage ? (
                <ChaiImage
                  alt={filename || "attachment"}
                  className="size-4 object-cover"
                  height={16}
                  src={data.url}
                  width={16}
                />
              ) : (
                <div className="flex size-4 items-center justify-center text-muted-foreground">
                  <PaperclipIcon className="size-3" />
                </div>
              )}
            </div>
            <Button
              aria-label={t("Remove attachment")}
              className="absolute inset-0 size-4 cursor-pointer rounded p-0 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 [&>svg]:size-2.5"
              onClick={(e) => {
                e.stopPropagation();
                attachments.remove(data.id);
              }}
              type="button"
              variant="ghost">
              <XIcon />
              <span className="sr-only">{t("Remove")}</span>
            </Button>
          </div>

          <span className="flex-1 truncate">{attachmentLabel}</span>
        </div>
      </HoverCardTrigger>
      <PromptInputHoverCardContent className="w-auto p-2">
        <div className="w-auto space-y-3">
          {isImage && (
            <div className="flex max-h-96 w-96 items-center justify-center overflow-hidden rounded-md border">
              <ChaiImage
                alt={filename || "attachment preview"}
                className="max-h-full max-w-full object-contain"
                height={384}
                src={data.url}
                width={448}
              />
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 max-w-lg flex-1 space-y-1 px-0.5">
              <h4 className="truncate text-sm font-semibold leading-none">
                {filename || (isImage ? t("Image") : t("Attachment"))}
              </h4>
              {data.mediaType && <p className="truncate font-mono text-xs text-muted-foreground">{data.mediaType}</p>}
            </div>
          </div>
        </div>
      </PromptInputHoverCardContent>
    </PromptInputHoverCard>
  );
}

export type PromptInputAttachmentsProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children: (attachment: FileUIPart & { id: string; size?: number }) => ReactNode;
};

export function PromptInputAttachments({ children, className, ...props }: PromptInputAttachmentsProps) {
  const attachments = usePromptInputAttachments();

  if (!attachments.files.length) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 p-3", className)} {...props}>
      {attachments.files.map((file) => (
        <Fragment key={file.id}>{children(file)}</Fragment>
      ))}
    </div>
  );
}

export type PromptInputActionAddAttachmentsProps = ComponentProps<typeof DropdownMenuItem> & {
  label?: string;
  accept?: string;
};

export const PromptInputActionAddAttachments = ({
  label = "Add photos or files",
  accept,
  ...props
}: PromptInputActionAddAttachmentsProps) => {
  const attachments = usePromptInputAttachments();

  return (
    <DropdownMenuItem
      {...props}
      onSelect={(e) => {
        e.preventDefault();
        attachments.openFileDialog(accept);
      }}>
      {props.children || <ImageIcon className="mr-2 size-4" />}
      {label}
    </DropdownMenuItem>
  );
};

export type PromptInputMessage = {
  text: string;
  files: FileUIPart[];
};

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit" | "onError"> & {
  accept?: string; // e.g., "image/*" or leave undefined for any
  multiple?: boolean;
  globalDrop?: boolean;
  // Minimal constraints
  maxFiles?: number;
  maxFileSize?: number; // bytes
  maxCombinedSize?: number; // bytes
  onError?: (err: { code: "max_files" | "max_file_size" | "max_combined_size" | "accept"; message: string }) => void;
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export const PromptInput = ({
  className,
  accept,
  multiple,
  globalDrop,
  maxFiles,
  maxFileSize,
  maxCombinedSize,
  onError,
  onSubmit,
  children,
  ...props
}: PromptInputProps) => {
  const { t } = useTranslation();
  // Try to use a provider controller if present
  const controller = useOptionalPromptInputController();
  const usingProvider = !!controller;

  // Refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Find nearest form to scope drag & drop
  useEffect(() => {
    const root = anchorRef.current?.closest("form");
    if (root instanceof HTMLFormElement) {
      formRef.current = root;
    }
  }, []);

  // ----- Local attachments (only used when no provider)
  const [items, setItems] = useState<(FileUIPart & { id: string; size?: number })[]>([]);
  const files = usingProvider && controller ? controller.attachments.files : items;

  const openFileDialogLocal = useCallback(
    (customAccept?: string) => {
      if (customAccept && inputRef.current) {
        inputRef.current.accept = customAccept;
      } else if (inputRef.current) {
        inputRef.current.accept = accept || "";
      }
      inputRef.current?.click();
    },
    [accept],
  );

  const matchesAccept = useCallback(
    (f: File) => {
      if (!accept || accept.trim() === "") {
        return true;
      }
      // Parse comma-separated accept string (mirrors browser native behaviour).
      // Each token can be:
      //   - a wildcard group  : "image/*", "video/*", "audio/*"
      //   - an exact MIME type: "application/pdf", "application/vnd.ms-excel", etc.
      const tokens = accept.split(",").map((t) => t.trim());
      return tokens.some((token) => {
        if (token.endsWith("/*")) {
          // e.g. "image/*" → match any "image/…"
          return f.type.startsWith(token.slice(0, -1));
        }
        return f.type === token;
      });
    },
    [accept],
  );

  const addLocal = useCallback(
    (fileList: File[] | FileList) => {
      const incoming = Array.from(fileList);
      const accepted = incoming.filter((f) => matchesAccept(f));
      if (incoming.length && accepted.length === 0) {
        onError?.({
          code: "accept",
          message: t("No files match the accepted types."),
        });
        return;
      }
      const withinSize = (f: File) => (maxFileSize ? f.size <= maxFileSize : true);
      const sized = accepted.filter(withinSize);
      if (accepted.length > 0 && sized.length === 0) {
        onError?.({
          code: "max_file_size",
          message: t("All files exceed the maximum size."),
        });
        return;
      }

      let currentCombinedSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
      let acceptedFiles = sized;

      if (maxCombinedSize) {
        const filesWithinCombinedLimit: File[] = [];
        let limitExceeded = false;
        for (const f of sized) {
          if (currentCombinedSize + f.size <= maxCombinedSize) {
            filesWithinCombinedLimit.push(f);
            currentCombinedSize += f.size;
          } else {
            limitExceeded = true;
            break;
          }
        }
        if (limitExceeded) {
          onError?.({
            code: "max_combined_size",
            message: t("Combined file size exceeds the limit. Max allowed size is {{size}}MB", {
              size: Math.round(maxCombinedSize / 1024 / 1024),
            }),
          });
        }
        acceptedFiles = filesWithinCombinedLimit;
      }

      const capacity = typeof maxFiles === "number" ? Math.max(0, maxFiles - files.length) : undefined;
      const capped = typeof capacity === "number" ? acceptedFiles.slice(0, capacity) : acceptedFiles;
      if (typeof capacity === "number" && acceptedFiles.length > capacity) {
        onError?.({
          code: "max_files",
          message: "Too many files. Some were not added.",
        });
      }

      if (capped.length === 0) return;

      const next: (FileUIPart & { id: string; size?: number })[] = [];
      for (const file of capped) {
        next.push({
          id: nanoid(),
          type: "file",
          url: URL.createObjectURL(file),
          mediaType: file.type,
          filename: file.name,
          size: file.size,
        });
      }
      setItems((prev) => prev.concat(next));
    },
    [matchesAccept, maxFiles, maxFileSize, maxCombinedSize, onError, files],
  );

  const add = useMemo(
    () => (usingProvider && controller ? (files: File[] | FileList) => controller.attachments.add(files) : addLocal),
    [usingProvider, controller, addLocal],
  );

  const remove = useMemo(
    () =>
      usingProvider && controller
        ? (id: string) => controller.attachments.remove(id)
        : (id: string) =>
            setItems((prev) => {
              const found = prev.find((file) => file.id === id);
              if (found?.url) {
                URL.revokeObjectURL(found.url);
              }
              return prev.filter((file) => file.id !== id);
            }),
    [usingProvider, controller, setItems],
  );

  const clear = useMemo(
    () =>
      usingProvider && controller
        ? () => controller.attachments.clear()
        : () =>
            setItems((prev) => {
              for (const file of prev) {
                if (file.url) {
                  URL.revokeObjectURL(file.url);
                }
              }
              return [];
            }),
    [usingProvider, controller, setItems],
  );

  const openFileDialog = useMemo(
    () => (usingProvider && controller ? () => controller.attachments.openFileDialog() : openFileDialogLocal),
    [usingProvider, controller, openFileDialogLocal],
  );

  // Let provider know about our hidden file input so external menus can call openFileDialog()
  useEffect(() => {
    if (!usingProvider || !controller) return;
    controller.__registerFileInput(inputRef, () => inputRef.current?.click());
  }, [usingProvider, controller]);

  // Note: File input cannot be programmatically set for security reasons
  // The syncHiddenInput prop is no longer functional
  useEffect(() => {
    if (inputRef.current && files.length === 0) {
      inputRef.current.value = "";
    }
  }, [files]);

  // Attach drop handlers on nearest form and document (opt-in)
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        add(e.dataTransfer.files);
      }
    };
    form.addEventListener("dragover", onDragOver);
    form.addEventListener("drop", onDrop);
    return () => {
      form.removeEventListener("dragover", onDragOver);
      form.removeEventListener("drop", onDrop);
    };
  }, [add]);

  useEffect(() => {
    if (!globalDrop) return;

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        add(e.dataTransfer.files);
      }
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [add, globalDrop]);

  const revokeLocalBlobUrlsRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    revokeLocalBlobUrlsRef.current = () => {
      if (usingProvider) {
        return;
      }

      for (const file of files) {
        if (file.url?.startsWith("blob:")) {
          URL.revokeObjectURL(file.url);
        }
      }
    };
  }, [files, usingProvider]);

  useEffect(
    () => () => {
      // Only revoke on unmount or when provider status changes
      revokeLocalBlobUrlsRef.current?.();
    },
    [usingProvider],
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.currentTarget.files) {
      add(event.currentTarget.files);
    }
  };

  const convertBlobUrlToDataUrl = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const ctx = useMemo<AttachmentsContext>(
    () => ({
      files: files.map((item) => ({ ...item, id: item.id })),
      add,
      remove,
      clear,
      openFileDialog,
      fileInputRef: inputRef,
    }),
    [files, add, remove, clear, openFileDialog],
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const text =
      usingProvider && controller
        ? controller.textInput.value
        : (() => {
            const formData = new FormData(form);
            return (formData.get("message") as string) || "";
          })();

    // Reset form immediately after capturing text to avoid race condition
    // where user input during async blob conversion would be lost
    if (!usingProvider) {
      form.reset();
    }

    // Convert blob URLs to data URLs asynchronously
    Promise.all(
      files.map(async ({ ...item }) => {
        if (item.url && item.url.startsWith("blob:")) {
          return {
            ...item,
            url: await convertBlobUrlToDataUrl(item.url),
          };
        }
        return item;
      }),
    ).then((convertedFiles: FileUIPart[]) => {
      try {
        const result = onSubmit({ text, files: convertedFiles }, event);

        // Handle both sync and async onSubmit
        if (result instanceof Promise) {
          result
            .then(() => {
              clear();
              if (usingProvider && controller) {
                controller.textInput.clear();
              }
            })
            .catch(() => {
              // Don't clear on error - user may want to retry
            });
        } else {
          // Sync function completed without throwing, clear attachments
          clear();
          if (usingProvider && controller) {
            controller.textInput.clear();
          }
        }
      } catch {
        // Don't clear on error - user may want to retry
      }
    });
  };

  // Render with or without local provider
  const inner = (
    <>
      <span aria-hidden="true" className="hidden" ref={anchorRef} />
      <input
        accept={accept}
        aria-label={t("Upload files")}
        className="hidden"
        multiple={multiple}
        onChange={handleChange}
        ref={inputRef}
        title={t("Upload files")}
        type="file"
      />
      <form className={cn("w-full", className)} onSubmit={handleSubmit} {...props}>
        <InputGroup className="overflow-hidden">{children}</InputGroup>
      </form>
    </>
  );

  return usingProvider ? (
    inner
  ) : (
    <LocalAttachmentsContext.Provider value={ctx}>{inner}</LocalAttachmentsContext.Provider>
  );
};

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
  <div className={cn("contents", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
  onChange,
  className,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) => {
  const controller = useOptionalPromptInputController();
  const attachments = usePromptInputAttachments();
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter") {
      if (isComposing || e.nativeEvent.isComposing) {
        return;
      }
      if (e.shiftKey) {
        return;
      }
      e.preventDefault();

      // Check if the submit button is disabled before submitting
      const form = e.currentTarget.form;
      const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitButton?.disabled) {
        return;
      }

      form?.requestSubmit();
    }

    // Remove last attachment when Backspace is pressed and textarea is empty
    if (e.key === "Backspace" && e.currentTarget.value === "" && attachments.files.length > 0) {
      e.preventDefault();
      const lastAttachment = attachments.files.at(-1);
      if (lastAttachment) {
        attachments.remove(lastAttachment.id);
      }
    }
  };

  const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    const items = event.clipboardData?.items;

    if (!items) {
      return;
    }

    const files: File[] = [];

    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      event.preventDefault();
      attachments.add(files);
    }
  };

  const controlledProps = controller
    ? {
        value: controller.textInput.value,
        onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
          controller.textInput.setInput(e.currentTarget.value);
          onChange?.(e);
        },
      }
    : {
        onChange,
      };

  return (
    <InputGroupTextarea
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      {...props}
      {...controlledProps}
    />
  );
};

export type PromptInputHeaderProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputHeader = ({ className, ...props }: PromptInputHeaderProps) => (
  <InputGroupAddon align="block-end" className={cn("order-first flex-wrap gap-1", className)} {...props} />
);

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
  <InputGroupAddon align="block-end" className={cn("justify-between gap-1", className)} {...props} />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props} />
);

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton>;

export const PromptInputButton = ({ variant = "ghost", className, size, ...props }: PromptInputButtonProps) => {
  const newSize = size ?? (Children.count(props.children) > 1 ? "sm" : "icon-sm");

  return <InputGroupButton className={cn(className)} size={newSize} type="button" variant={variant} {...props} />;
};

export type PromptInputActionMenuProps = ComponentProps<typeof DropdownMenu>;
export const PromptInputActionMenu = (props: PromptInputActionMenuProps) => <DropdownMenu {...props} />;

export type PromptInputActionMenuTriggerProps = PromptInputButtonProps;

export const PromptInputActionMenuTrigger = ({ className, children, ...props }: PromptInputActionMenuTriggerProps) => (
  <DropdownMenuTrigger asChild>
    <PromptInputButton className={className} {...props}>
      {children ?? <PlusIcon className="size-4" />}
    </PromptInputButton>
  </DropdownMenuTrigger>
);

export type PromptInputActionMenuContentProps = ComponentProps<typeof DropdownMenuContent>;
export const PromptInputActionMenuContent = ({ className, ...props }: PromptInputActionMenuContentProps) => (
  <DropdownMenuContent align="start" className={cn(className)} {...props} />
);

export type PromptInputActionMenuItemProps = ComponentProps<typeof DropdownMenuItem>;
export const PromptInputActionMenuItem = ({ className, ...props }: PromptInputActionMenuItemProps) => (
  <DropdownMenuItem className={cn(className)} {...props} />
);

// Note: Actions that perform side-effects (like opening a file dialog)
// are provided in opt-in modules (e.g., prompt-input-attachments).

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
};

export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const { t } = useTranslation();
  let Icon = <CornerDownLeftIcon className="size-4" />;

  if (status === "submitted") {
    Icon = <Loading className="h-4 w-4" />;
  } else if (status === "streaming") {
    Icon = <SquareIcon className="size-4" />;
  } else if (status === "error") {
    Icon = <XIcon className="size-4" />;
  }

  return (
    <InputGroupButton
      aria-label={t("Submit")}
      className={cn(className)}
      size={size}
      type="submit"
      variant={variant}
      {...props}>
      {children ?? Icon}
    </InputGroupButton>
  );
};

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

type SpeechRecognitionResultList = {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
};

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

export type PromptInputSpeechButtonProps = ComponentProps<typeof PromptInputButton> & {
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onTranscriptionChange?: (text: string) => void;
};

const SPEECH_LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
};

const toSpeechLocale = (lang: string | undefined): string => {
  if (!lang) return "en-US";
  const base = lang.toLowerCase().split("-")[0];
  return SPEECH_LOCALE_MAP[lang] ?? SPEECH_LOCALE_MAP[base] ?? lang;
};

export const PromptInputSpeechButton = ({
  className,
  textareaRef,
  onTranscriptionChange,
  ...props
}: PromptInputSpeechButtonProps) => {
  const { t, i18n } = useTranslation();
  const speechLang = toSpeechLocale(i18n.language);
  const speechLangRef = useRef(speechLang);
  speechLangRef.current = speechLang;
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = speechLang;
    }
  }, [speechLang]);

  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const speechRecognition = new SpeechRecognition();

      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = speechLangRef.current;

      speechRecognition.onstart = () => {
        setIsListening(true);
      };

      speechRecognition.onend = () => {
        setIsListening(false);
      };

      speechRecognition.onresult = (event) => {
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0]?.transcript ?? "";
          }
        }

        if (finalTranscript && textareaRef?.current) {
          const textarea = textareaRef.current;
          const currentValue = textarea.value;
          const newValue = currentValue + (currentValue ? " " : "") + finalTranscript;

          textarea.value = newValue;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          onTranscriptionChange?.(newValue);
        }
      };

      speechRecognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current = speechRecognition;
      startTransition(() => setRecognition(speechRecognition));
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [textareaRef, onTranscriptionChange]);

  const toggleListening = useCallback(() => {
    if (!recognition) {
      return;
    }

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  }, [recognition, isListening]);

  return (
    <div className="relative">
      {isListening && (
        <div className="absolute -top-0 left-0 z-10 flex items-center gap-x-1 rounded-md border-b bg-background p-1 shadow-xl">
          <div className="flex items-center gap-x-0.5 pl-1">
            <div className="h-2 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite] rounded-full bg-primary" />
            <div className="h-2.5 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite_0.1s] rounded-full bg-primary" />
            <div className="h-1.5 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite_0.2s] rounded-full bg-primary" />
            <div className="h-3 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite_0.3s] rounded-full bg-primary" />
            <div className="h-2 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite_0.4s] rounded-full bg-primary" />
            <div className="h-2.5 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite_0.5s] rounded-full bg-primary" />
          </div>
          <PromptInputButton
            onClick={toggleListening}
            className="ml-2 h-4 w-4 p-0"
            variant="default"
            size="icon-xs"
            title={t("Done recording")}>
            <Check className="!h-3.5 !w-3.5" />
          </PromptInputButton>
        </div>
      )}
      <PromptInputButton
        className={cn(
          "relative h-6 w-6 p-0 transition-all duration-200",
          isListening && "bg-primary text-primary-foreground",
          className,
        )}
        disabled={!recognition}
        onClick={toggleListening}
        aria-label={props["aria-label"] || t("Start voice input")}
        title={props.title || t("Start voice input")}
        {...props}>
        <MicIcon className="!h-3.5 !w-3.5" />
      </PromptInputButton>
    </div>
  );
};

export type PromptInputSelectProps = ComponentProps<typeof Select>;

export const PromptInputSelect = (props: PromptInputSelectProps) => <Select {...props} />;

export type PromptInputSelectTriggerProps = ComponentProps<typeof SelectTrigger>;

export const PromptInputSelectTrigger = ({ className, ...props }: PromptInputSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      "border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors",
      "hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
      className,
    )}
    {...props}
  />
);

export type PromptInputSelectContentProps = ComponentProps<typeof SelectContent>;

export const PromptInputSelectContent = ({ className, ...props }: PromptInputSelectContentProps) => (
  <SelectContent className={cn(className)} {...props} />
);

export type PromptInputSelectItemProps = ComponentProps<typeof SelectItem>;

export const PromptInputSelectItem = ({ className, ...props }: PromptInputSelectItemProps) => (
  <SelectItem className={cn(className)} {...props} />
);

export type PromptInputSelectValueProps = ComponentProps<typeof SelectValue>;

export const PromptInputSelectValue = ({ className, ...props }: PromptInputSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
);

export type PromptInputHoverCardProps = ComponentProps<typeof HoverCard>;

export const PromptInputHoverCard = ({ openDelay = 0, closeDelay = 0, ...props }: PromptInputHoverCardProps) => (
  <HoverCard closeDelay={closeDelay} openDelay={openDelay} {...props} />
);

export type PromptInputHoverCardTriggerProps = ComponentProps<typeof HoverCardTrigger>;

export const PromptInputHoverCardTrigger = (props: PromptInputHoverCardTriggerProps) => <HoverCardTrigger {...props} />;

export type PromptInputHoverCardContentProps = ComponentProps<typeof HoverCardContent>;

export const PromptInputHoverCardContent = ({ align = "start", ...props }: PromptInputHoverCardContentProps) => (
  <HoverCardContent align={align} {...props} />
);

export type PromptInputTabsListProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTabsList = ({ className, ...props }: PromptInputTabsListProps) => (
  <div className={cn(className)} {...props} />
);

export type PromptInputTabProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTab = ({ className, ...props }: PromptInputTabProps) => (
  <div className={cn(className)} {...props} />
);

export type PromptInputTabLabelProps = HTMLAttributes<HTMLHeadingElement>;

export const PromptInputTabLabel = ({ className, ...props }: PromptInputTabLabelProps) => (
  <h3 className={cn("mb-2 px-3 text-xs font-medium text-muted-foreground", className)} {...props} />
);

export type PromptInputTabBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTabBody = ({ className, ...props }: PromptInputTabBodyProps) => (
  <div className={cn("space-y-1", className)} {...props} />
);

export type PromptInputTabItemProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTabItem = ({ className, ...props }: PromptInputTabItemProps) => (
  <div className={cn("flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent", className)} {...props} />
);

export type PromptInputCommandProps = ComponentProps<typeof Command>;

export const PromptInputCommand = ({ className, ...props }: PromptInputCommandProps) => (
  <Command className={cn(className)} {...props} />
);

export type PromptInputCommandInputProps = ComponentProps<typeof CommandInput>;

export const PromptInputCommandInput = ({ className, ...props }: PromptInputCommandInputProps) => (
  <CommandInput className={cn(className)} {...props} />
);

export type PromptInputCommandListProps = ComponentProps<typeof CommandList>;

export const PromptInputCommandList = ({ className, ...props }: PromptInputCommandListProps) => (
  <CommandList className={cn(className)} {...props} />
);

export type PromptInputCommandEmptyProps = ComponentProps<typeof CommandEmpty>;

export const PromptInputCommandEmpty = ({ className, ...props }: PromptInputCommandEmptyProps) => (
  <CommandEmpty className={cn(className)} {...props} />
);

export type PromptInputCommandGroupProps = ComponentProps<typeof CommandGroup>;

export const PromptInputCommandGroup = ({ className, ...props }: PromptInputCommandGroupProps) => (
  <CommandGroup className={cn(className)} {...props} />
);

export type PromptInputCommandItemProps = ComponentProps<typeof CommandItem>;

export const PromptInputCommandItem = ({ className, ...props }: PromptInputCommandItemProps) => (
  <CommandItem className={cn(className)} {...props} />
);

export type PromptInputCommandSeparatorProps = ComponentProps<typeof CommandSeparator>;

export const PromptInputCommandSeparator = ({ className, ...props }: PromptInputCommandSeparatorProps) => (
  <CommandSeparator className={cn(className)} {...props} />
);
