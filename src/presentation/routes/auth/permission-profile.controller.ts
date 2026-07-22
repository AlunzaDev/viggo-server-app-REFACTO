import { Request, Response } from "express";
import { CreatePermissionProfileDto } from "../../../domain/dtos/auth/create-permission-profile.dto";
import { UpdatePermissionProfileDto } from "../../../domain/dtos/auth/update-permission-profile.dto";
import { ErrorService } from "../../services/error.service";
import { PermissionProfileService } from "../../services/auth/permission-profile.service";

export class PermissionProfileController {
  constructor(private readonly service: PermissionProfileService) {}

  createProfile = async (req: Request, res: Response) => {
    try {
      const [error, dto] = CreatePermissionProfileDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const profile = await this.service.createProfile(dto!);
      return res.status(201).json({ profile });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProfiles = async (_req: Request, res: Response) => {
    try {
      const profiles = await this.service.getProfiles();
      return res.status(200).json({ profiles });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProfileById = async (req: Request, res: Response) => {
    try {
      const profile = await this.service.getProfileById(String(req.params.id));
      return res.status(200).json({ profile });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateProfile = async (req: Request, res: Response) => {
    try {
      const [error, dto] = UpdatePermissionProfileDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const profile = await this.service.updateProfile(String(req.params.id), dto!);
      return res.status(200).json({ profile });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteProfile = async (req: Request, res: Response) => {
    try {
      const profile = await this.service.deleteProfile(String(req.params.id));
      return res.status(200).json({ profile });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
