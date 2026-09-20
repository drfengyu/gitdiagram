"use client";

import { CredentialDialog } from "./credential-dialog";

interface PrivateReposDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  repository?: string;
}

export function PrivateReposDialog({
  repository,
  ...props
}: PrivateReposDialogProps) {
  const tokenUrl = new URL(
    "https://github.com/settings/personal-access-tokens/new",
  );
  tokenUrl.search = new URLSearchParams({
    name: "GitDiagram",
    description: "Read selected repositories to generate architecture diagrams",
    expires_in: "30",
    contents: "read",
    ...(repository ? { target_name: repository.split("/")[0]! } : {}),
  }).toString();
  const aiPrompt = [
    repository
      ? `帮我把 https://github.com/${repository} 接入 GitDiagram。`
      : "帮我把一个私有 GitHub 仓库接入 GitDiagram。",
    `用我的浏览器打开 ${tokenUrl.toString()}，创建一个名为 GitDiagram、30 天过期的 fine-grained personal access token。`,
    repository
      ? `资源所有者选择 ${repository.split("/")[0]}，并且只授权 ${repository} 这一个仓库。`
      : "先问我要使用哪个仓库，然后选择它的资源所有者，并且只授权那一个仓库。",
    "把仓库的 Contents 权限设为只读，Metadata 只读会自动包含。不要添加任何写入或账户权限。",
    "如果组织需要审批，告诉我要让组织的管理员审批什么。",
    "帮我把令牌直接粘贴到 GitDiagram 的 GitHub 访问对话框并保存。不要把令牌放进对话、日志或文件里。",
    "如果你无法使用我的浏览器，请简要地带我完成这些步骤。",
  ].join("\n\n");

  return (
    <CredentialDialog
      {...props}
      credential="github_pat"
      title="GitHub 访问"
      description="使用令牌让 GitDiagram 读取你的私有仓库。"
      setup={{
        instructions: (
          <>
            选择仓库所有者并选中{" "}
            {repository ? (
              <strong className="break-all">{repository}</strong>
            ) : (
              "你的仓库"
            )}
            。<strong>Contents: Read-only</strong> 已默认选好。
          </>
        ),
        url: tokenUrl.toString(),
        linkLabel: "在 GitHub 创建令牌",
        aiPrompt,
      }}
      dataUsage={
        <>
          你的令牌会保存在受保护的浏览器 cookie 中，有效期 30
          天。仓库内容会发送给 AI 服务商以生成你的图表。私有图表会在 GitDiagram
          上私密保存。
        </>
      }
    />
  );
}
