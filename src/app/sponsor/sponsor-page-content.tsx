import { ArrowDown } from "lucide-react";
import { SponsorEmailActions } from "./sponsor-email-actions";
import { SponsorPlacementPreview } from "./sponsor-placement-preview";
import {
  SPONSOR_EMAIL,
  SPONSOR_EMAIL_ADDRESS,
  SPONSOR_PRICE,
  sponsorFits,
  type SponsorContent,
  type SponsorMetric,
} from "./sponsor-content";
import styles from "./sponsor-page.module.css";

function AudienceMetrics({
  title,
  metrics,
}: {
  title: string;
  metrics: SponsorMetric[];
}) {
  return (
    <div className={styles.metricGroup}>
      <h3>{title}</h3>
      <dl className={styles.metrics}>
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd className={styles.metricValue}>{metric.value}</dd>
            <dd className={styles.metricDetail}>{metric.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SponsorPageContent({ content }: { content: SponsorContent }) {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1>
          把开发者
          <br />
          <span>带到你的产品</span>
        </h1>
        <p className={styles.introduction}>
          过去 30 天，GitDiagram 有{" "}
          <strong>{content.monthlyVisitors} 名已统计的独立访客</strong>
          。在开发者浏览 GitHub 仓库时触达他们，展示位置直接链接到你的网站。
        </p>
        <p className={styles.offerSummary}>
          <span>
            <strong>{SPONSOR_PRICE} USD</strong> · 30 天
          </span>
          <span className={styles.offerSummaryDetails}>
            包含全部四个展示位置
          </span>
        </p>
        <div className={styles.heroActions}>
          <SponsorEmailActions
            email={SPONSOR_EMAIL_ADDRESS}
            mailto={SPONSOR_EMAIL}
          />
          <a href="#sponsor-placements" className={styles.textLink}>
            查看展示位置
            <ArrowDown aria-hidden="true" />
          </a>
        </div>
      </section>

      <section
        id="sponsor-audience"
        className={styles.audience}
        aria-labelledby="audience-title"
      >
        <h2 id="audience-title">受众</h2>
        <div className={styles.audienceColumns}>
          <AudienceMetrics title="过去 30 天" metrics={content.monthly} />
          <AudienceMetrics title="历史累计" metrics={content.lifetime} />
        </div>
        <div className={styles.dataNote}>
          <p>
            数据来源：PostHog 和 GitHub。{" "}
            <time dateTime={content.asOf}>更新于 {content.updatedAt}</time>
          </p>
          <p>
            数据约每五分钟刷新一次，30 天统计窗口截至上方所示时间。
            访客在每个窗口内独立去重；浏览量统计的是网站流量，而非赞助曝光。
          </p>
        </div>
      </section>

      <section
        className={styles.detailSection}
        id="sponsor-placements"
        aria-labelledby="placements-title"
      >
        <h2 id="placements-title">展示位置</h2>
        <div>
          <div className={styles.placements}>
            {content.surfaces.map((surface) => (
              <article key={surface.name}>
                <div className={styles.placementHeading}>
                  <h3>{surface.name}</h3>
                  <p>
                    <span>{surface.metric.value}</span> {surface.metric.label}
                  </p>
                </div>
                <p>{surface.description}</p>
                <SponsorPlacementPreview
                  name={surface.name}
                  preview={surface.preview}
                />
              </article>
            ))}
          </div>
          <p className={styles.placementNote}>
            浏览量来自同一个 30 天统计窗口。
          </p>
        </div>
      </section>

      <section className={styles.detailSection} aria-labelledby="fit-title">
        <div>
          <h2 id="fit-title">适合的赞助方</h2>
          <p className={styles.sectionIntro}>
            如果你的客户在开发软件，GitDiagram 就是推介你产品的合适位置。
          </p>
        </div>
        <div>
          <ul className={styles.fitList}>
            {sponsorFits.map((fit) => (
              <li key={fit}>{fit}</li>
            ))}
          </ul>
          <p className={styles.privacy}>
            赞助内容有明确标注，不含第三方广告脚本、追踪像素或弹窗。
          </p>
        </div>
      </section>

      <section
        className={styles.offer}
        id="sponsor-offer"
        aria-labelledby="offer-title"
      >
        <div className={styles.offerHeading}>
          <div>
            <h2 id="offer-title">30 天赞助方案</h2>
            <p className={styles.offerDescription}>
              你的 logo、简短的产品介绍，以及指向你网站的链接。 统一价格，30
              天内覆盖首页、仓库图表页面、仓库浏览目录和 GitHub README。
            </p>
          </div>
          <p className={styles.price}>
            {SPONSOR_PRICE} <span>USD / 30 天</span>
          </p>
        </div>
        <div className={styles.offerActions}>
          <div>
            <SponsorEmailActions
              email={SPONSOR_EMAIL_ADDRESS}
              mailto={SPONSOR_EMAIL}
            />
            <p className={styles.availability}>
              现已开放。给 Mr.Albert 发邮件，确定投放档期与素材。
            </p>
          </div>
          <p className={styles.terms}>
            上线前一次性付款。
            <br />
            无自动续费。
          </p>
        </div>
      </section>
    </main>
  );
}
