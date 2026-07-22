import type { Request, Response, NextFunction } from 'express';
import { createError, createResponse } from '../../helpers/response';
import { CourseService } from './courses.service';
import { getPublicCourseById } from '../../services/publicCatalogService';

const courseService = new CourseService();

export const coursesController = {
  publicHome: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { items, meta } = await courseService.list(req.query, true, true);
      res.json(createResponse(items, '', meta));
    } catch (error) {
      next(error);
    }
  },

  publicList: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { items, meta } = await courseService.list(req.query, true);
      res.json(createResponse(items, '', meta));
    } catch (error) {
      next(error);
    }
  },

  publicGetById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const course = await getPublicCourseById(req.params.id, String(req.query.lang || 'en'));
      if (!course) return res.status(404).json(createError('Course not found'));
      res.json(createResponse(course));
    } catch (error) {
      next(error);
    }
  },

  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { items, meta } = await courseService.list(req.query);
      res.json(createResponse(items, '', meta));
    } catch (error) {
      next(error);
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const course = await courseService.create(req);
      res.status(201).json(createResponse(course, 'Course created successfully'));
    } catch (error: any) {
      if (/duplicate key/i.test(error?.message ?? '')) return res.status(409).json(createError('Course slug already exists'));
      res.status(400).json(createError(error?.message || 'Failed to create course'));
    }
  },

  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const course = await courseService.getById(req.params.id, String(req.query.lang || 'en'));
      if (!course) return res.status(404).json(createError('Course not found'));
      res.json(createResponse(course));
    } catch (error) {
      next(error);
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const course = await courseService.update(req);
      if (!course) return res.status(404).json(createError('Course not found'));
      res.json(createResponse(course, 'Course updated successfully'));
    } catch (error: any) {
      res.status(400).json(createError(error?.message || 'Failed to update course'));
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const course = await courseService.softDelete(req);
      if (!course) return res.status(404).json(createError('Course not found'));
      res.json(createResponse({}, 'Course deleted successfully'));
    } catch (error: any) {
      res.status(400).json(createError(error?.message || 'Failed to delete course'));
    }
  }
};
