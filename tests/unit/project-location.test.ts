import { describe, expect, it } from "vitest";
import { projectLocation } from "../../src/domain/entities/parking/project-location";

describe("projectLocation", () => {
  it("takes a point [lon, lat] as it is", () => {
    expect(projectLocation([-117.03, 32.51])).toEqual({ lat: 32.51, lng: -117.03 });
  });

  it("takes the average of an area's points", () => {
    const center = projectLocation([[-99, 19], [-99.2, 19.2], [-99.1, 19.4]]);
    expect(center?.lat).toBeCloseTo(19.2);
    expect(center?.lng).toBeCloseTo(-99.1);
  });

  it("ignores invalid points of an area", () => {
    expect(projectLocation([[-99, 19], ["x", 1], [500, 19]])).toEqual({ lat: 19, lng: -99 });
  });

  it("has no location without usable coordinates", () => {
    for (const value of [null, undefined, {}, [], [0, 0], [1], ["a", "b"], [10, 95], [[0, 0]], [[]]]) {
      expect(projectLocation(value)).toBeNull();
    }
  });
});
