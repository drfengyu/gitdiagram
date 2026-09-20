"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { preload } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Expand } from "lucide-react";
import type { SponsorSurface } from "./sponsor-content";
import styles from "./sponsor-placement-preview.module.css";

export function SponsorPlacementPreview({
  name,
  preview,
}: Pick<SponsorSurface, "name" | "preview">) {
  const [instant, setInstant] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  function preloadImage() {
    preload(preview.src, { as: "image" });
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={styles.trigger}
          aria-label={`查看展示位置：${name}`}
          onClick={(event) => setInstant(event.detail === 0)}
          onPointerEnter={preloadImage}
          onFocus={preloadImage}
        >
          <Expand aria-hidden="true" />
          查看展示位置
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className={styles.overlay}
          data-instant={instant || undefined}
        />
        <Dialog.Content
          className={styles.dialog}
          data-instant={instant || undefined}
          onEscapeKeyDown={() => setInstant(true)}
          style={
            {
              "--preview-ratio": preview.width / preview.height,
            } as CSSProperties
          }
        >
          <div className={styles.heading}>
            <Dialog.Title className={styles.title}>{name}</Dialog.Title>
            <a
              className={styles.fullSize}
              href={preview.src}
              target="_blank"
              rel="noopener noreferrer"
            >
              查看大图
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <Dialog.Description className="sr-only">
            {preview.caption} 点击图片外部或按 Escape 关闭。
          </Dialog.Description>
          {!imageReady && (
            <span className={styles.loading} role="status">
              正在加载预览……
            </span>
          )}
          <div
            className={styles.imageStage}
            data-ready={imageReady || undefined}
          >
            <Image
              src={preview.src}
              alt={preview.alt}
              width={preview.width}
              height={preview.height}
              className={styles.image}
              loading="eager"
              onLoad={() => setImageReady(true)}
              onError={() => setImageReady(true)}
              unoptimized
            />
            <svg
              className={styles.highlight}
              viewBox={`0 0 ${preview.width} ${preview.height}`}
              aria-hidden="true"
            >
              <rect
                {...preview.highlight}
                rx="10"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <Dialog.Close
            className={styles.accessibleClose}
            onClick={() => setInstant(true)}
          >
            关闭预览
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
