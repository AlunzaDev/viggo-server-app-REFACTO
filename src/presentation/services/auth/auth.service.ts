import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async registerUser(
    user: Omit<UsuarioEntity, "id">,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const userByCorreo = await this.authRepository.findByCorreo(user.correo);
    if (userByCorreo) {
      throw CustomError.badRequest("El correo ya esta registrado");
    }

    const userByTelefono = await this.authRepository.findByTelefono(
      user.telefono,
    );
    if (userByTelefono) {
      throw CustomError.badRequest("El telefono ya esta registrado");
    }

    const hashedPassword = bcryptPlugin.hash(user.password);

    const usuario = await this.authRepository.register({
      ...user,
      password: hashedPassword,
    });

    const token = await JwtPlugin.generateToken({ id: usuario.id });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async loginCorreo(
    correo: string,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findByCorreo(correo);

    if (!usuario) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    const validPassword = bcryptPlugin.compare(password, usuario.password);

    if (!validPassword) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    const token = await JwtPlugin.generateToken({ id: usuario.id });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password: _, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async loginTelefono(
    telefono: string,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findByTelefono(telefono);

    if (!usuario) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    const validPassword = bcryptPlugin.compare(password, usuario.password);

    if (!validPassword) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    const token = await JwtPlugin.generateToken({ id: usuario.id });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password: _, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async renewToken(
    id: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findById(id);

    if (!usuario) {
      throw CustomError.unauthorized("Usuario no encontrado");
    }

    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    const token = await JwtPlugin.generateToken({ id: usuario.id });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }
}
