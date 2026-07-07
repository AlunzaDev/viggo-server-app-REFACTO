export type BoletoContextError = {
  ok: false;
  codRepuesta: "01";
  codigoError: string;
  descripcionError: string;
};

export class BoletoContextErrorFactory {
  static invalidTicket(): BoletoContextError {
    return this.create("02", "BOLETO NO VALIDO");
  }

  static storeNotEnabled(): BoletoContextError {
    return this.create("04", "COBRO NO HABILITADO PARA ESTA TIENDA");
  }

  static blacklisted(): BoletoContextError {
    return this.create(
      "02",
      "El boleto se encuentra en lista negra, contacte con el proveedor",
    );
  }

  static create(
    codigoError: string,
    descripcionError: string,
  ): BoletoContextError {
    return {
      ok: false,
      codRepuesta: "01",
      codigoError,
      descripcionError,
    };
  }
}
