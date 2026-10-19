import { describe, expect, it } from "vitest";
import { ProyectoEntity } from "../../src/domain/entities/parking/proyecto.entity";
import { toMobileParkingArea } from "../../src/presentation/services/parking/mobile-parking-area.presenter";

describe("mobile parking area presenter", () => {
  it("exposes geofence data without local infrastructure secrets", () => {
    const project = new ProyectoEntity({
      id: "019a0000-0000-7000-8000-000000000010",
      nombre: "Centro",
      coordinates: [[-99.14, 19.42], [-99.12, 19.42], [-99.12, 19.44]],
      ciudad: "CDMX",
      identificador: "centro",
      serverIp: "10.0.0.8",
      serverMac: "AA:BB:CC:DD:EE:FF",
      localApiBaseUrl: "https://local.invalid",
      paymentProviderId: "019a0000-0000-7000-8000-000000000011",
      estado: true,
    });
    const output = toMobileParkingArea(project);
    expect(output).toMatchObject({ nombre: "Centro" });
    expect(output).not.toHaveProperty("paymentProviderId");
    expect(output).not.toHaveProperty("serverIp");
    expect(output).not.toHaveProperty("serverMac");
    expect(output).not.toHaveProperty("localApiBaseUrl");
    expect(output).not.toHaveProperty("remoteSupport");
  });
});
