"use client";

import { useCallback, useEffect, useState } from "react";

import { SponsorSlot } from "~/components/sponsor-slot";
import {
  fetchSponsorList,
  saveSponsorList,
} from "~/features/sponsors/admin-api";
import type { Sponsor, SponsorPlacement } from "~/features/sponsors/types";
import { MAX_SPONSORS } from "~/features/sponsors/types";

const TOKEN_STORAGE_KEY = "sponsors-admin-token";

type Row = {
  id?: string;
  name: string;
  body: string;
  cta: string;
  href: string;
  logoText: string;
  logoSrc: string;
  active: boolean;
};

type Status = { kind: "idle" | "ok" | "error"; message: string } | null;

const FIELD_CLASS =
  "w-full rounded-md border-2 border-black bg-white px-2 py-1.5 text-sm text-black outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const BUTTON_CLASS =
  "inline-flex min-h-9 items-center justify-center rounded-md border-2 border-black px-3 py-1.5 text-xs font-semibold";

function emptyRow(): Row {
  return {
    name: "",
    body: "",
    cta: "赞助",
    href: "https://",
    logoText: "",
    logoSrc: "",
    active: true,
  };
}

function toRow(sponsor: Sponsor): Row {
  return {
    id: sponsor.id,
    name: sponsor.name,
    body: sponsor.body,
    cta: sponsor.cta,
    href: sponsor.href,
    logoText: sponsor.logoText ?? "",
    logoSrc: sponsor.logoSrc ?? "",
    active: sponsor.active,
  };
}

function toInput(row: Row) {
  return {
    ...(row.id ? { id: row.id } : {}),
    name: row.name.trim(),
    body: row.body.trim(),
    cta: row.cta.trim(),
    href: row.href.trim(),
    ...(row.logoText.trim() ? { logoText: row.logoText.trim() } : {}),
    ...(row.logoSrc.trim() ? { logoSrc: row.logoSrc.trim() } : {}),
    active: row.active,
  };
}

function toPlacement(row: Row): SponsorPlacement {
  return {
    id: row.id ?? "draft",
    name: row.name.trim() || "未命名赞助商",
    body: row.body.trim(),
    cta: row.cta.trim() || "赞助",
    href: row.href.trim() || "/sponsor",
    logoText: row.logoText.trim() || undefined,
    logoSrc: row.logoSrc.trim() || undefined,
  };
}

export function SponsorAdminClient() {
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [etag, setEtag] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (secret: string) => {
    setBusy(true);
    const result = await fetchSponsorList(secret);
    setBusy(false);

    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
      return;
    }

    setRows(result.sponsors.map(toRow));
    setEtag(result.etag);
    setLoaded(true);
    setStatus({ kind: "ok", message: `已载入 ${result.sponsors.length} 条。` });
  }, []);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) {
      return;
    }
    setToken(stored);
    void load(stored);
  }, [load]);

  function update(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) {
      return;
    }
    setRows((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }

  async function handleSave() {
    setBusy(true);
    const result = await saveSponsorList(token, {
      baseEtag: etag,
      sponsors: rows.map(toInput),
    });
    setBusy(false);

    if (!result.ok) {
      if (result.conflict) {
        setStatus({ kind: "error", message: result.error });
        setRows(result.conflict.sponsors.map(toRow));
        setEtag(result.conflict.etag);
      } else {
        setStatus({ kind: "error", message: result.error });
      }
      return;
    }

    setRows(result.sponsors.map(toRow));
    setEtag(result.etag);
    setStatus({ kind: "ok", message: "已保存，首页与浏览页几分钟内生效。" });
  }

  const preview = rows.find((row) => row.active && row.name.trim());

  return (
    <section className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border-2 border-black p-4 dark:border-neutral-700">
        <label className="min-w-[16rem] flex-1">
          <span className="block text-xs font-semibold tracking-wide uppercase">
            管理密钥
          </span>
          <input
            className={FIELD_CLASS}
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="SPONSOR_ADMIN_TOKEN"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className={`${BUTTON_CLASS} bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800`}
          onClick={() => {
            window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
            void load(token);
          }}
        >
          载入名单
        </button>
      </div>

      {status ? (
        <p
          role="status"
          className={
            status.kind === "error"
              ? "text-sm font-semibold text-red-700 dark:text-red-400"
              : "text-sm font-semibold text-green-700 dark:text-green-400"
          }
        >
          {status.message}
        </p>
      ) : null}

      {loaded ? (
        <>
          <div className="space-y-4">
            {rows.map((row, index) => (
              <div
                key={row.id ?? `draft-${index}`}
                className="grid grid-cols-1 gap-2 rounded-lg border-2 border-black p-4 sm:grid-cols-2 dark:border-neutral-700"
              >
                <input
                  className={FIELD_CLASS}
                  value={row.name}
                  onChange={(event) =>
                    update(index, { name: event.target.value })
                  }
                  placeholder="名称"
                />
                <input
                  className={FIELD_CLASS}
                  value={row.href}
                  onChange={(event) =>
                    update(index, { href: event.target.value })
                  }
                  placeholder="链接（https://… 或 /站内路径）"
                />
                <input
                  className={FIELD_CLASS}
                  value={row.body}
                  onChange={(event) =>
                    update(index, { body: event.target.value })
                  }
                  placeholder="一句话文案"
                />
                <input
                  className={FIELD_CLASS}
                  value={row.cta}
                  onChange={(event) =>
                    update(index, { cta: event.target.value })
                  }
                  placeholder="按钮文字"
                />
                <input
                  className={FIELD_CLASS}
                  value={row.logoText}
                  onChange={(event) =>
                    update(index, { logoText: event.target.value })
                  }
                  placeholder="文字 logo（最多 4 字）"
                />
                <input
                  className={FIELD_CLASS}
                  value={row.logoSrc}
                  onChange={(event) =>
                    update(index, { logoSrc: event.target.value })
                  }
                  placeholder="logo 站内路径（/xxx.png）"
                />
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(event) =>
                      update(index, { active: event.target.checked })
                    }
                  />
                  启用
                </label>
                <div className="flex items-center gap-2 sm:justify-end">
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    onClick={() => move(index, 1)}
                    disabled={index === rows.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${BUTTON_CLASS} bg-red-100 dark:bg-red-900`}
                    onClick={() =>
                      setRows((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() =>
                setRows((current) =>
                  current.length >= MAX_SPONSORS
                    ? current
                    : [...current, emptyRow()],
                )
              }
            >
              新增一家
            </button>
            <button
              type="button"
              className={`${BUTTON_CLASS} bg-neutral-200 font-bold dark:bg-neutral-700`}
              onClick={() => void handleSave()}
              disabled={busy}
            >
              {busy ? "处理中…" : "保存"}
            </button>
          </div>

          {preview ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wide uppercase">
                预览（取第一个启用的条目）
              </h2>
              <SponsorSlot surface="home" sponsor={toPlacement(preview)} />
              <SponsorSlot surface="diagram" sponsor={toPlacement(preview)} />
              <div className="overflow-hidden rounded-lg border-2 border-black dark:border-neutral-700">
                <table className="w-full text-left">
                  <tbody>
                    <SponsorSlotPreviewRow row={preview} />
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function SponsorSlotPreviewRow({ row }: { row: Row }) {
  return (
    <tr>
      <td className="p-0">
        <SponsorSlot surface="browse" sponsor={toPlacement(row)} />
      </td>
    </tr>
  );
}
