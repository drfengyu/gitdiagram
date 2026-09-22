"use client";

import { CredentialDialog } from "./credential-dialog";

interface ApiKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  /** True when the pending generation uses a gateway model, not OpenAI. */
  gatewayMode?: boolean;
  keyPortalUrl?: string | null;
}

const API_KEYS_URL = "https://platform.openai.com/api-keys";
const AI_PROMPT = [
  "帮我给 GitDiagram 配置一个 OpenAI API Key。",
  `用我的浏览器打开 ${API_KEYS_URL}，帮我在选定的项目里创建一个名为 GitDiagram 的 secret key。`,
  "说明使用这个密钥生成图表会计入我的 OpenAI API 账户费用。如果还需要设置账单，请引导我完成，并在添加支付方式或购买额度前先问我。",
  "帮我把密钥直接粘贴到 GitDiagram 的 OpenAI API Key 对话框并保存。不要把密钥放进对话、日志或文件里。",
  "如果你无法使用我的浏览器，请简要地带我完成这些步骤。",
].join("\n\n");
const GATEWAY_AI_PROMPT = [
  "帮我给 GitDiagram 配置一个 Cloudflare AI 控制台的 API Key。",
  "用我的浏览器打开该控制台的 API Keys 页面，帮我创建一个名为 GitDiagram 的密钥。",
  "说明使用这个密钥生成图表会计入我在该控制台的余额。",
  "帮我把密钥直接粘贴到 GitDiagram 的 API Key 对话框并保存。不要把密钥放进对话、日志或文件里。",
  "如果你无法使用我的浏览器，请简要地带我完成这些步骤。",
].join("\n\n");

export function ApiKeyDialog({
  gatewayMode,
  keyPortalUrl,
  ...props
}: ApiKeyDialogProps) {
  if (gatewayMode) {
    return (
      <CredentialDialog
        {...props}
        credential="openai_api_key"
        title="Cloudflare AI 控制台 API Key"
        description="所选模型走 Cloudflare AI 控制台网关，需要使用你在该控制台创建的 API Key，费用由你的控制台余额计量。"
        setup={{
          instructions: (
            <>
              在 Cloudflare AI 控制台的“API
              Keys”页面创建一个密钥。使用该密钥的生成会计入你在该控制台的余额，而不是
              OpenAI 账户。
            </>
          ),
          url: keyPortalUrl ?? API_KEYS_URL,
          linkLabel: "在 Cloudflare AI 控制台创建 API Key",
          aiPrompt: GATEWAY_AI_PROMPT,
        }}
        dataUsage={
          <>
            你的 API Key 会保存在受保护的浏览器 cookie 中，有效期 30 天。页面
            JavaScript 无法读取它。GitDiagram
            仅在服务器端用它通过网关生成你的图表。
          </>
        }
      />
    );
  }

  return (
    <CredentialDialog
      {...props}
      credential="openai_api_key"
      title="OpenAI API Key"
      description="使用你自己的 API Key，通过 OpenAI 账户生成图表。"
      setup={{
        instructions: (
          <>
            在你的 OpenAI 项目中创建一个 secret key。使用该密钥的生成会计入你的
            OpenAI 账户费用。
          </>
        ),
        url: API_KEYS_URL,
        linkLabel: "在 OpenAI 创建 API Key",
        aiPrompt: AI_PROMPT,
      }}
      dataUsage={
        <>
          你的 API Key 会保存在受保护的浏览器 cookie 中，有效期 30 天。页面
          JavaScript 无法读取它。GitDiagram 仅在服务器端用它来生成你的图表。
        </>
      }
    />
  );
}
