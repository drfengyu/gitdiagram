"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import type { CredentialKind } from "~/features/credentials/api";
import { useCredentialSetting } from "~/hooks/use-credential-setting";
import { GITHUB_REPO_URL } from "~/lib/site";

import controls from "./generation/workspace.module.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

const CREDENTIAL_LABELS = {
  openai_api_key: {
    noun: "API Key",
    name: "API Key",
    inputLabel: "OpenAI API Key",
    placeholder: "sk-...",
    saved: "API Key 已保存，粘贴新的可替换。",
  },
  github_pat: {
    noun: "令牌",
    name: "GitHub 令牌",
    inputLabel: "GitHub 个人访问令牌",
    placeholder: "github_pat_...",
    saved: "令牌已保存。粘贴新的可替换。",
  },
} as const;

interface CredentialDialogProps {
  credential: CredentialKind;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  title: string;
  description: string;
  setup: {
    instructions: ReactNode;
    url: string;
    linkLabel: string;
    aiPrompt: string;
  };
  dataUsage: ReactNode;
}

export function CredentialDialog({
  credential,
  isOpen,
  onClose,
  onSaved,
  title,
  description,
  setup,
  dataUsage,
}: CredentialDialogProps) {
  const inputId = useId();
  const hintId = useId();
  const labels = CREDENTIAL_LABELS[credential];
  const {
    clear,
    error,
    isConfigured,
    isPending,
    pendingAction,
    save,
    setValue,
    value,
  } = useCredentialSetting({ credential, isOpen });
  const errors = {
    load: `无法读取已保存的${labels.noun}状态。`,
    save: `无法保存${labels.name}，请重试。`,
    clear: `无法清除${labels.name}，请重试。`,
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending || !value.trim()) return;
    if (await save()) {
      onClose();
      await onSaved?.();
    }
  };

  const handleClear = async () => {
    if (await clear()) {
      if (onSaved) {
        onClose();
        await onSaved();
      }
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`ph-no-capture neo-panel ${controls.controlsTheme} max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-lg p-5 sm:max-w-md sm:p-6`}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-neutral-700 dark:text-neutral-300">
            {description}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-bold">1. 创建{labels.noun}</h3>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {setup.instructions}
            </p>
            <a
              href={setup.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${controls.actionButton} ${controls.primary} w-full`}
            >
              {setup.linkLabel}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
            <CopySetupPrompt prompt={setup.aiPrompt} />
          </div>
          <div className="space-y-2">
            <label htmlFor={inputId} className="block text-sm font-bold">
              2. 粘贴你的{labels.noun}
            </label>
            <Input
              id={inputId}
              type="password"
              aria-label={labels.inputLabel}
              aria-describedby={hintId}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={
                isConfigured
                  ? `粘贴用于替换的${labels.noun}`
                  : labels.placeholder
              }
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={isPending}
              className="neo-input h-11 rounded-md px-3 py-2 text-base placeholder:font-normal placeholder:text-gray-600 dark:placeholder:text-neutral-400"
              required
            />
            <p
              id={hintId}
              className="pt-1 text-xs text-neutral-700 dark:text-neutral-300"
            >
              {isConfigured
                ? labels.saved
                : "在本浏览器保存 30 天，可随时清除。"}
            </p>
          </div>
          <details className="text-xs text-neutral-700 dark:text-neutral-300">
            <summary className="neo-link w-fit cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-4">
              你的数据如何使用
            </summary>
            <p className="mt-2 leading-relaxed">
              {dataUsage} 你也可以{" "}
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="neo-link underline"
              >
                自托管
              </a>
              。
            </p>
          </details>
          {error && (
            <p
              role="alert"
              className="text-sm font-medium text-red-700 dark:text-red-300"
            >
              {errors[error]}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {isConfigured && (
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={isPending}
                className="neo-link min-h-10 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingAction === "clear" ? "清除中..." : `清除${labels.noun}`}
              </button>
            )}
            <div className="ml-auto grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className={controls.actionButton}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!value.trim() || isPending}
                className={`${controls.actionButton} ${controls.primary}`}
              >
                {pendingAction === "save"
                  ? "保存中..."
                  : onSaved
                    ? "保存并重试"
                    : `保存${labels.noun}`}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CopySetupPrompt({ prompt }: { prompt: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void copyPrompt()}
        className={`${controls.actionButton} w-full`}
      >
        {status === "copied" ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
        <span aria-live="polite">
          {status === "copied"
            ? "已复制！粘贴到你的 AI"
            : "为我的 AI 复制提示词"}
        </span>
      </button>
      {status === "failed" && (
        <div className="space-y-2">
          <p role="alert" className="text-sm">
            无法复制。请选择下方提示词手动复制。
          </p>
          <textarea
            aria-label="AI 设置提示词"
            readOnly
            value={prompt}
            onFocus={(event) => event.currentTarget.select()}
            className="neo-input min-h-28 w-full rounded-md p-3 text-sm"
          />
        </div>
      )}
    </>
  );
}
