import { PermissionProfileModel } from "../../../data/mongo/models/auth/permission-profile.schema";
import type { UserAppAccess } from "../../../domain/constants";
import { PermissionProfileDatasource } from "../../../domain/datasources/auth/permission-profile.datasource";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";

export class PermissionProfileMongoDatasource extends PermissionProfileDatasource {
  async create(
    profile: Omit<PermissionProfileEntity, "id">,
  ): Promise<PermissionProfileEntity> {
    const document = await PermissionProfileModel.create(profile);

    return PermissionProfileEntity.fromObject(document.toObject());
  }

  async getAll(app?: UserAppAccess): Promise<PermissionProfileEntity[]> {
    const documents = await PermissionProfileModel.find(app ? { app } : {})
      .sort({ app: 1, nombre: 1 })
      .lean();

    return documents.map((document) =>
      PermissionProfileEntity.fromObject(document),
    );
  }

  async findById(id: string): Promise<PermissionProfileEntity | null> {
    const document = await PermissionProfileModel.findById(id).lean();

    return document ? PermissionProfileEntity.fromObject(document) : null;
  }

  async findByNombre(
    app: UserAppAccess,
    nombre: string,
  ): Promise<PermissionProfileEntity | null> {
    const document = await PermissionProfileModel.findOne({
      app,
      nombre,
    }).lean();

    return document ? PermissionProfileEntity.fromObject(document) : null;
  }

  async update(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id" | "app">>,
  ): Promise<PermissionProfileEntity | null> {
    const document = await PermissionProfileModel.findByIdAndUpdate(
      id,
      profile,
      {
        new: true,
        runValidators: true,
      },
    ).lean();

    return document ? PermissionProfileEntity.fromObject(document) : null;
  }

  async delete(id: string): Promise<PermissionProfileEntity | null> {
    const document = await PermissionProfileModel.findByIdAndDelete(id).lean();

    return document ? PermissionProfileEntity.fromObject(document) : null;
  }
}
