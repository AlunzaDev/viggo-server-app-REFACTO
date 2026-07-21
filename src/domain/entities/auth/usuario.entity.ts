import { CustomError } from "../../errors/custom.error";
import {
  isUsuarioRol,
  normalizeUserParkings,
  normalizeUserModules,
  type UserModuleAccess,
  UsuarioRol,
} from "../../constants";

export interface UsuarioEntityOptions {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  coordinates?: number[];
  password: string;
  emailValidated: boolean;
  rol: UsuarioRol;
  parkings: string[];
  modules: UserModuleAccess[];
  nacimiento?: number;
  img?: string;
  estado: boolean;
  google: boolean;
}

export class UsuarioEntity {
  public id: string;
  public nombre: string;
  public apellido: string;
  public correo: string;
  public telefono: string;
  public coordinates?: number[];
  public password: string;
  public emailValidated: boolean;
  public rol: UsuarioRol;
  public parkings: string[];
  public modules: UserModuleAccess[];
  public nacimiento?: number;
  public img?: string;
  public estado: boolean;
  public google: boolean;

  constructor(options: UsuarioEntityOptions) {
    const {
      id,
      nombre,
      apellido,
      correo,
      telefono,
      coordinates,
      password,
      emailValidated,
      rol,
      parkings,
      modules,
      nacimiento,
      img,
      estado,
      google,
    } = options;

    this.id = id;
    this.nombre = nombre;
    this.apellido = apellido;
    this.correo = correo;
    this.telefono = telefono;
    this.coordinates = coordinates;
    this.password = password;
    this.emailValidated = emailValidated;
    this.rol = rol;
    this.parkings = parkings;
    this.modules = modules;
    this.nacimiento = nacimiento;
    this.img = img;
    this.estado = estado;
    this.google = google;
  }

  static fromObject(object: { [key: string]: unknown }): UsuarioEntity {
    const {
      _id,
      id,
      nombre,
      apellido,
      correo,
      telefono,
      coordinates,
      password,
      emailValidated,
      rol,
      parkings,
      modules,
      nacimiento,
      img,
      estado,
      google,
    } = object;

    const usuarioId = id || (_id ? String(_id) : undefined);

    if (!usuarioId) throw CustomError.badRequest("Missing id");
    if (!nombre) throw CustomError.badRequest("Missing nombre");
    if (!apellido) throw CustomError.badRequest("Missing apellido");
    if (!correo) throw CustomError.badRequest("Missing correo");
    if (!telefono) throw CustomError.badRequest("Missing telefono");
    if (!password) throw CustomError.badRequest("Missing password");
    if (!rol) throw CustomError.badRequest("Missing rol");
    if (estado === undefined || estado === null) {
      throw CustomError.badRequest("Missing estado");
    }
    if (google === undefined || google === null) {
      throw CustomError.badRequest("Missing google");
    }

    return new UsuarioEntity({
      id: String(usuarioId),
      nombre: String(nombre).trim(),
      apellido: String(apellido).trim(),
      correo: String(correo).trim().toLowerCase(),
      telefono: String(telefono).trim(),
      coordinates: Array.isArray(coordinates)
        ? coordinates.map((value) => Number(value))
        : undefined,
      password: String(password),
      emailValidated: emailValidated === true,
      rol: isUsuarioRol(rol)
        ? rol
        : (() => {
            throw CustomError.badRequest("Invalid rol");
          })(),
      parkings: normalizeUserParkings(parkings),
      modules: normalizeUserModules(modules),
      nacimiento:
        typeof nacimiento === "number"
          ? nacimiento
          : nacimiento
            ? Number(nacimiento)
            : undefined,
      img: typeof img === "string" ? img : undefined,
      estado: Boolean(estado),
      google: Boolean(google),
    });
  }
}
