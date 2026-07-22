import { PermissionProfileModel } from "../../../data/mongo/models/auth/permission-profile.schema";
import { PermissionProfileDatasource } from "../../../domain/datasources/auth/permission-profile.datasource";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";

export class PermissionProfileMongoDatasource extends PermissionProfileDatasource {
  async create(
    profile: Omit<PermissionProfileEntity, "id">,
  ): Promise<PermissionProfileEntity> {
    const document = await PermissionProfileModel.create(profile);
    return PermissionProfileEntity.fromObject(document.toObject());
  }

  async getAll(): Promise<PermissionProfileEntity[]> {
    const documents = await PermissionProfileModel.find().sort({ nombre: 1 });
    return documents.map((document) =>
      PermissionProfileEntity.fromObject(document.toObject()),
    );
  }

  async findById(id: string): Promise<PermissionProfileEntity | null> {
    const document = await PermissionProfileModel.findById(id);
    return document ? PermissionProfileEntity.fromObject(document.toObject()) : null;
  }

  async findByNombre(nombre: string): Promise<PermissionProfileEntity | null> {
    const document = await PermissionProfileModel.findOne({ nombre });
    return document ? PermissionProfileEntity.fromObject(document.toObject()) : null;
  }

  async update(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id">>,
  ): Promise<PermissionProfileEntity | null> {
    const document = await PermissionProfileModel.findByIdAndUpdate(id, profile, {
      new: true,
    });
    return document ? PermissionProfileEntity.fromObject(document.toObject()) : null;
  }

  async delete(id: string): Promise<PermissionProfileEntity | null> {
    const document = await PermissionProfileModel.findByIdAndDelete(id);
    return document ? PermissionProfileEntity.fromObject(document.toObject()) : null;
  }
}
