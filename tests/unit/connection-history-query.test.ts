import { describe, expect, it } from "vitest";
import { ConnectionHistoryQueryDto } from "../../src/domain/dtos/heartbeat/connection-history-query.dto";

const NOW = Date.UTC(2026, 9, 22, 18);
const DAY = 24 * 60 * 60 * 1000;

describe("ConnectionHistoryQueryDto", () => {
  it("defaults to the last 7 days, page 1 of 50", () => {
    const [error, query] = ConnectionHistoryQueryDto.create({}, NOW);
    expect(error).toBeUndefined();
    expect(query).toMatchObject({ desde: NOW - 7 * DAY, hasta: NOW, page: 1, limit: 50 });
  });

  it("accepts milliseconds or ISO dates, and caps the page size", () => {
    const [, query] = ConnectionHistoryQueryDto.create({ desde: String(NOW - DAY), hasta: new Date(NOW).toISOString(), page: "3", limit: "500", sujeto: "modulo" }, NOW);
    expect(query).toMatchObject({ desde: NOW - DAY, hasta: NOW, page: 3, limit: 100, sujeto: "modulo" });
  });

  it("rejects what it cannot use", () => {
    expect(ConnectionHistoryQueryDto.create({ hasta: "nunca" }, NOW)[0]).toBeTruthy();
    expect(ConnectionHistoryQueryDto.create({ desde: String(NOW), hasta: String(NOW) }, NOW)[0]).toBeTruthy();
    expect(ConnectionHistoryQueryDto.create({ desde: String(NOW - 93 * DAY) }, NOW)[0]).toBeTruthy();
    expect(ConnectionHistoryQueryDto.create({ modulo: "1" }, NOW)[0]).toBeTruthy();
  });
});
