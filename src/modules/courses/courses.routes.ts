import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { coursesController } from './courses.controller';
import { courseQuerySchema, createCourseSchema, idParamsSchema, updateCourseSchema } from './courses.validation';

const router = Router();

const manageCourses = requireRole('super_admin', 'admin', 'branch_manager', 'owner');
const viewCourses = requireRole('super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner', 'system_automation');

router.get('/public/home', validate(courseQuerySchema), coursesController.publicHome);
router.get('/public', validate(courseQuerySchema), coursesController.publicList);
router.get('/public/:id', validate(idParamsSchema), coursesController.publicGetById);

router.use(authenticate);

router.get('/', viewCourses, validate(courseQuerySchema), coursesController.list);
router.post('/', manageCourses, validate(createCourseSchema), coursesController.create);
router.get('/:id', viewCourses, validate(idParamsSchema), coursesController.getById);
router.put('/:id', manageCourses, validate(updateCourseSchema), coursesController.update);
router.delete('/:id', manageCourses, validate(idParamsSchema), coursesController.remove);

export const courseRouter = router;
