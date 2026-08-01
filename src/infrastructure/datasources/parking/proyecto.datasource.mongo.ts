import { CounterModel } from "../../../data/mongo/models/system/counter.schema";
import { createHash, randomBytes } from "node:crypto";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { ProyectoDatasource } from "../../../domain/datasources/parking/proyecto.datasource";
import type { ProyectoInstallationLinkTokenResult } from "../../../domain/datasources/parking/proyecto.datasource";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { deleteManagedProjectImage } from "../../../presentation/utils/project-image.util";
import {
    decryptInstallationLinkToken,
    encryptInstallationLinkToken,
} from "../../../presentation/utils/installation-link-token-crypto.util";

const createInstallationLinkToken = (codigoProyecto?: string) => {
    const prefix = codigoProyecto ? `viggo-${codigoProyecto}` : "viggo-project";
    return `${prefix}-${randomBytes(18).toString("base64url")}`;
};

const hashInstallationLinkToken = (token: string) =>
    createHash("sha256").update(token).digest("hex");

export class ProyectoMongoDatasource extends ProyectoDatasource {
    async create(proyecto: Omit<ProyectoEntity, "id">) {
        const codigoProyecto =
            proyecto.codigoProyecto ?? (await this.getNextCodigoProyecto());
        const installationLinkToken = createInstallationLinkToken(codigoProyecto);
        try {
            const proyectoDocument = await ProyectoModel.create({
                ...proyecto,
                codigoProyecto,
                installationLinkTokenHash: hashInstallationLinkToken(installationLinkToken),
                installationLinkTokenEncrypted: encryptInstallationLinkToken(installationLinkToken),
                installationLinkTokenIssuedAt: Date.now(),
            });
            return {
                proyecto: ProyectoEntity.fromObject(proyectoDocument.toObject()),
                installationLinkToken,
            };
        } catch (error) {
            deleteManagedProjectImage(proyecto.img);
            throw error;
        }
    }

    async getInstallationLinkToken(id: string): Promise<ProyectoInstallationLinkTokenResult | null> {
        const proyectoDocument = await ProyectoModel.findById(id);
        if (!proyectoDocument) return null;

        const encryptedToken = String(
            proyectoDocument.get("installationLinkTokenEncrypted") ?? "",
        ).trim();
        const legacyTokenValue = String(
            proyectoDocument.get("installationLinkTokenValue") ?? "",
        ).trim();
        const installationLinkToken =
            decryptInstallationLinkToken(encryptedToken) || legacyTokenValue;

        if (!encryptedToken && legacyTokenValue) {
            await ProyectoModel.findByIdAndUpdate(proyectoDocument.id, {
                installationLinkTokenEncrypted: encryptInstallationLinkToken(legacyTokenValue),
                installationLinkTokenValue: "",
            });
        }

        if (!installationLinkToken) {
            return {
                proyecto: ProyectoEntity.fromObject(proyectoDocument.toObject()),
                installationLinkToken: "",
            };
        }

        return {
            proyecto: ProyectoEntity.fromObject(proyectoDocument.toObject()),
            installationLinkToken,
        };
    }

    async regenerateInstallationLinkToken(id: string): Promise<ProyectoInstallationLinkTokenResult | null> {
        const existingProject = await ProyectoModel.findById(id);
        if (!existingProject) return null;

        const codigoProyecto = String(
            existingProject.codigoProyecto ?? existingProject.identificador ?? "",
        ).trim() || undefined;
        const installationLinkToken = createInstallationLinkToken(codigoProyecto);

        const proyectoDocument = await ProyectoModel.findByIdAndUpdate(
            id,
            {
                installationLinkTokenHash: hashInstallationLinkToken(installationLinkToken),
                installationLinkTokenEncrypted: encryptInstallationLinkToken(installationLinkToken),
                installationLinkTokenValue: "",
                installationLinkTokenIssuedAt: Date.now(),
            },
            { new: true },
        );

        if (!proyectoDocument) return null;

        return {
            proyecto: ProyectoEntity.fromObject(proyectoDocument.toObject()),
            installationLinkToken,
        };
    }

    async findById(id: string): Promise<ProyectoEntity | null> {
        const proyectoDocument = await ProyectoModel.findById(id);
        if (!proyectoDocument) return null;

        return ProyectoEntity.fromObject(proyectoDocument.toObject());
    }

    async findByIdentificador(identificador: string): Promise<ProyectoEntity | null> {
        const proyectoDocument = await ProyectoModel.findOne({ identificador });
        if (!proyectoDocument) return null;

        return ProyectoEntity.fromObject(proyectoDocument.toObject());
    }

    async getAll(): Promise<ProyectoEntity[]> {
        const proyectos = await ProyectoModel.find();
        return proyectos.map((proyecto) => ProyectoEntity.fromObject(proyecto.toObject()));
    }

    async update(
        id: string,
        proyecto: Partial<Omit<ProyectoEntity, "id">>,
    ): Promise<ProyectoEntity | null> {
        const existingProject = await ProyectoModel.findById(id);
        if (!existingProject) {
            deleteManagedProjectImage(proyecto.img);
            return null;
        }

        const previousImage = String(existingProject.img ?? "").trim();
        const nextImage =
            typeof proyecto.img === "string" ? proyecto.img.trim() : undefined;

        try {
            const proyectoDocument = await ProyectoModel.findByIdAndUpdate(id, proyecto, {
                new: true,
            });

            if (!proyectoDocument) return null;

            if (nextImage !== undefined && nextImage !== previousImage) {
                deleteManagedProjectImage(previousImage);
            }

            return ProyectoEntity.fromObject(proyectoDocument.toObject());
        } catch (error) {
            if (nextImage && nextImage !== previousImage) {
                deleteManagedProjectImage(nextImage);
            }
            throw error;
        }
    }

    async delete(id: string): Promise<ProyectoEntity | null> {
        const proyectoDocument = await ProyectoModel.findByIdAndDelete(id);

        if (!proyectoDocument) return null;

        deleteManagedProjectImage(String(proyectoDocument.img ?? ""));

        return ProyectoEntity.fromObject(proyectoDocument.toObject());
    }

    private async getNextCodigoProyecto(): Promise<string> {
        await this.ensureProjectCounterInitialized();

        const counter = await CounterModel.findOneAndUpdate(
            { name: "proyecto_codigo" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
        );

        const sequence = Number(counter.seq);
        if (sequence > 9999) {
            throw CustomError.badRequest(
                "Se alcanzo el limite de 9999 codigos de proyecto",
            );
        }

        return String(sequence).padStart(4, "0");
    }

    private async ensureProjectCounterInitialized(): Promise<void> {
        const existingCounter = await CounterModel.findOne({
            name: "proyecto_codigo",
        }).lean();
        if (existingCounter) return;

        const proyectos = await ProyectoModel.find({
            codigoProyecto: { $regex: /^\d{4}$/ },
        })
            .select("codigoProyecto")
            .lean();
        const maxSequence = proyectos.reduce((max, proyecto) => {
            const sequence = Number(proyecto.codigoProyecto);
            return Number.isFinite(sequence) && sequence > max ? sequence : max;
        }, 0);

        try {
            await CounterModel.create({
                name: "proyecto_codigo",
                seq: maxSequence,
            });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
        }
    }
}
