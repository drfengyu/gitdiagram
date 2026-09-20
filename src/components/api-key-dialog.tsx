"use client";

import { CredentialDialog } from "./credential-dialog";

interface ApiKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

const API_KEYS_URL = "https://platform.openai.com/api-keys";
const AI_PROMPT = [
  "帮我给 GitDiagram 配置一个 OpenAI API Key。",
  `用我的浏览器打开 ${API_KEYS_URL}，帮我在选定的项目里创建一个名为 GitDiagram 的 secret key。`,
  "说明使用这个密钥生成图表会计入我的 OpenAI API 账户费用。如果还需要设置账单，请引导我完成，并在添加支付方式或购买额度前先问我。",
  "帮我把密钥直接粘贴到 GitDiagram 的 OpenAI API Key 对话框并保存。不要把密钥放进对话、日志或文件里。",
  "如果你无法使用我的浏览器，请简要地带我完成这些步骤。",
].join("\n\n");

export function ApiKeyDialog(props: ApiKeyDialogProps) {
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
