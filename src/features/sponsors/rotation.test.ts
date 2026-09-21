import { describe, expect, it } from "vitest";

import { resolveSponsorPlacements, sponsorRotationBucket } from "./rotation";
import type { Sponsor } from "./types";

function sponsor(overrides: Partial<Sponsor> & { id: string }): Sponsor {
  return {
    name: `name-${overrides.id}`,
    body: `body-${overrides.id}`,
    cta: "赞助",
    href: `https://example.com/${overrides.id}`,
    active: true,
    sortOrder: 0,
    ...overrides,
  };
}

const threeSponsors = [
  sponsor({ id: "alpha", sortOrder: 0 }),
  sponsor({ id: "bravo", sortOrder: 1 }),
  sponsor({ id: "charlie", sortOrder: 2 }),
];

function idsOf(placements: ReturnType<typeof resolveSponsorPlacements>) {
  return [placements.home, placements.diagram, placements.browse].map(
    (placement) => placement?.id ?? null,
  );
}

describe("resolveSponsorPlacements", () => {
  it("returns null placements for an empty active set", () => {
    expect(resolveSponsorPlacements([], 0)).toEqual({
      home: null,
      diagram: null,
      browse: null,
    });
    expect(
      resolveSponsorPlacements([sponsor({ id: "alpha", active: false })], 7),
    ).toEqual({ home: null, diagram: null, browse: null });
  });

  it("shows the only active sponsor in every surface", () => {
    expect(
      idsOf(resolveSponsorPlacements([sponsor({ id: "alpha" })], 3)),
    ).toEqual(["alpha", "alpha", "alpha"]);
  });

  it("never repeats a sponsor across the three surfaces when there are three", () => {
    for (let bucket = 0; bucket < 40; bucket += 1) {
      const ids = idsOf(resolveSponsorPlacements(threeSponsors, bucket));
      expect(new Set(ids).size).toBe(3);
    }
  });

  it("ignores inactive sponsors but keeps sortOrder as ring order", () => {
    const placements = resolveSponsorPlacements(
      [
        sponsor({ id: "gamma", sortOrder: 2 }),
        sponsor({ id: "beta", sortOrder: 1 }),
        sponsor({ id: "off", sortOrder: 0, active: false }),
        sponsor({ id: "alpha", sortOrder: 5 }),
      ],
      0,
    );
    const home = placements.home;
    const ringOrder = ["beta", "gamma", "alpha"];
    const start = ringOrder.indexOf(home?.id ?? "");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(idsOf(placements)).toEqual(
      [0, 1, 2].map((offset) => ringOrder[(start + offset) % ringOrder.length]),
    );
  });

  it("is deterministic for a bucket and rotates across buckets", () => {
    const first = idsOf(resolveSponsorPlacements(threeSponsors, 100));
    expect(idsOf(resolveSponsorPlacements(threeSponsors, 100))).toEqual(first);

    const seen = new Set<string>();
    for (let bucket = 0; bucket < 60; bucket += 1) {
      seen.add(
        idsOf(resolveSponsorPlacements(threeSponsors, bucket)).join(","),
      );
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("only changes the ring start when the hour bucket advances", () => {
    const windowMs = 60 * 60 * 1000;
    const base = sponsorRotationBucket(0);
    expect(sponsorRotationBucket(windowMs - 1)).toBe(base);
    expect(sponsorRotationBucket(windowMs)).toBe(base + 1);
  });
});
