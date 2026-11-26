"use client";

import type { FileUIPart } from "ai";
import { ArrowUp, GlobeIcon, ImageIcon, Paperclip, Square } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSpeechButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "~/builder/pages/components/ai-elements/prompt-input";
import { Button } from "~/components/ui/button";
import { ChaiBlock } from "~/types/common";
import { AIModel, useAIModels } from "./ai-models-context";
import { ModelSelectorDropdown } from "./model-selector-dropdown";
import { getDefaultModel } from "./models";

/** Shared with the block-level floating AI prompt so a model choice made in either place carries over to the other. */
export const MODEL_STORAGE_KEY = "chai-ai-selected-model";

interface AiPromptInputProps {
  input: string;
  setInput: (value: string) => void;
  /** 5th arg: non-image file attachments (e.g. PDF, DOCX, Excel) already converted to base64 data URLs */
  onSend: (prompt: string, label?: string, images?: FileUIPart[], model?: string, attachments?: FileUIPart[]) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  currentBlock?: ChaiBlock;
  selectedLang?: string;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  isGenerateImagePanel?: boolean;
}

// AI Prompt Input Component
const AiPromptInput = ({
  input,
  setInput,
  onSend,
  onStop,
  isLoading,
  disabled,
  selectedLang,
  selectedModel: propSelectedModel,
  onModelChange,
  isGenerateImagePanel = false,
}: AiPromptInputProps) => {
  const { t } = useTranslation();
  const { models } = useAIModels();
  const defaultModel = models.find((model: AIModel) => model.id === getDefaultModel()?.id) || models[0];
  const [localSelectedModel, setSelectedModel] = useState(propSelectedModel || defaultModel.id);
  const selectedModel = propSelectedModel || localSelectedModel;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [useWebSearch, setUseWebSearch] = useState(false);

  // Derive the current model definition to read allowedFileTypes
  const currentModel = models.find((m: AIModel) => m.id === selectedModel) || defaultModel;
  const defaultAllowedTypes = [
    "image/*",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const acceptString = currentModel?.allowedFileTypes
    ? currentModel?.allowedFileTypes?.join(",")
    : defaultAllowedTypes.join(",");
  // allowedFileTypes: [] marks a text-only model — hide attachment options entirely
  const modelAcceptsFiles = acceptString.length > 0;

  // Load saved model from localStorage on mount
  useEffect(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
    if (savedModel && models.find((m: AIModel) => m.id === savedModel)) {
      startTransition(() => {
        setSelectedModel(savedModel);
        onModelChange?.(savedModel);
      });
    } else {
      // Set default model if no saved model exists
      if (savedModel) localStorage.removeItem(MODEL_STORAGE_KEY);
      startTransition(() => {
        setSelectedModel(defaultModel.id);
        onModelChange?.(defaultModel.id);
      });
    }
  }, [onModelChange, defaultModel.id, models]);

  const handleSubmit = (message: { text: string; files: any[] }) => {
    const imageFiles = message.files.filter((file: FileUIPart) => file.mediaType?.startsWith("image/"));
    const nonImageFiles = message.files.filter((file: FileUIPart) => !file.mediaType?.startsWith("image/"));
    onSend(message.text?.trim(), undefined, imageFiles, selectedModel, nonImageFiles);
  };

  return (
    <div className="relative">
      <div className={`rounded-lg`}>
        <PromptInput
          onSubmit={handleSubmit}
          accept={acceptString}
          onError={(err) => toast.error(t(err.message))}
          className="flex h-auto w-full flex-col rounded-lg">
          <PromptInputHeader className="p-0">
            <PromptInputAttachments className="gap-0.5 px-1 pb-0 pt-1">
              {(attachment) => <PromptInputAttachment className="max-w-sm text-xs" data={attachment} />}
            </PromptInputAttachments>
          </PromptInputHeader>

          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isGenerateImagePanel
                ? t("Describe the image you want to generate")
                : selectedLang
                  ? t("Ask to update content")
                  : t("Ask anything...")
            }
            disabled={isLoading}
            autoFocus
            className="max-h-[200px] min-h-[60px] w-full p-2"
            rows={3}
          />

          <PromptInputFooter className="p-2">
            <PromptInputTools>
              {!selectedLang && !isGenerateImagePanel && modelAcceptsFiles && (
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger disabled={isLoading} className="h-6 w-6">
                    <Paperclip className="!h-3 !w-3" />
                  </PromptInputActionMenuTrigger>
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments
                      label={t("Add image")}
                      accept="image/*"
                      className="text-xs"
                      onClick={(e) => e.stopPropagation()}>
                      <ImageIcon className="mr-2 size-4" />
                    </PromptInputActionAddAttachments>
                    <PromptInputActionAddAttachments
                      label={t("Add file")}
                      accept="application/pdf,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="text-xs"
                      onClick={(e) => e.stopPropagation()}>
                      <Paperclip className="mr-2 size-4" />
                    </PromptInputActionAddAttachments>
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
              )}
              <PromptInputSpeechButton
                textareaRef={textareaRef}
                onTranscriptionChange={setInput}
                disabled={isLoading}
                aria-label={t("Start voice input")}
                title={t("Start voice input")}
              />
              {!isGenerateImagePanel && (
                <ModelSelectorDropdown
                  selectedModel={selectedModel}
                  onModelChange={(model) => {
                    setSelectedModel(model);
                    onModelChange?.(model);
                    localStorage.setItem(MODEL_STORAGE_KEY, model);
                  }}
                  disabled={isLoading}
                />
              )}
              <PromptInputButton
                className="hidden h-6 w-6"
                size="sm"
                onClick={() => setUseWebSearch(!useWebSearch)}
                variant={useWebSearch ? "default" : "ghost"}>
                <GlobeIcon className="!h-3 !w-3" />
              </PromptInputButton>
            </PromptInputTools>

            {isLoading ? (
              <Button onClick={onStop} size="xs" variant="secondary" title={t("Stop generation")}>
                <Square className="!h-3 !w-3" /> {t("Stop")}
              </Button>
            ) : (
              <PromptInputSubmit disabled={!input.trim() || disabled} className="h-6 w-6">
                <ArrowUp className="!h-3 !w-3 stroke-[3]" />
              </PromptInputSubmit>
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
};

export default AiPromptInput;
