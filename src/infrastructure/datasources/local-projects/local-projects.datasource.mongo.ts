import { ProjectHeartbeatSnapshotModel } from "../../../data/mongo/models/system/project-heartbeat-snapshot.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { LocalProjectsHttpDatasource, type LocalProjectsStore } from "./local-projects.http-datasource";

const mongoStore: LocalProjectsStore = {
  async findProject(projectId) {
    const proyecto = await ProyectoModel.findById(projectId).lean();
    return proyecto
      ? {
          id: String(proyecto._id),
          nombre: proyecto.nombre,
          identificador: proyecto.identificador,
          localApiBaseUrl: String(proyecto.localApiBaseUrl ?? "").trim(),
        }
      : null;
  },
  async findHeartbeat(projectId) {
    return ProjectHeartbeatSnapshotModel.findOne({ proyectoId: projectId }).lean();
  },
  async saveHeartbeat(projectId, data) {
    return (await ProjectHeartbeatSnapshotModel.findOneAndUpdate(
      { proyectoId: projectId },
      { proyectoId: projectId, ...data },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean()) as Record<string, unknown>;
  },
};

export class LocalProjectsMongoDatasource extends LocalProjectsHttpDatasource {
  constructor() {
    super(mongoStore);
  }
}
