import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";

export const toMobileParkingArea = (proyecto: ProyectoEntity) => ({
  id: proyecto.id,
  uid: proyecto.id,
  nombre: proyecto.nombre,
  coordinates: proyecto.coordinates,
  ciudad: proyecto.ciudad,
  identificador: proyecto.identificador,
  descripcion: proyecto.descripcion ?? "",
  img: proyecto.img ?? "",
  estado: proyecto.estado,
});
