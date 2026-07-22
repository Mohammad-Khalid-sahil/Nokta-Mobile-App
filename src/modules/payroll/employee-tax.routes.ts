import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { createResponse } from '../../helpers/response';
import { buildEmployeeTaxReport } from '../../services/employeeTax.service';

export const employeeTaxRouter = Router();

employeeTaxRouter.use(authenticate);

employeeTaxRouter.get('/', authorize(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
  try {
    const payload = await buildEmployeeTaxReport(req, false);
    res.json(createResponse(payload));
  } catch (error) {
    next(error);
  }
});

employeeTaxRouter.post('/recalculate', authorize(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
  try {
    const payload = await buildEmployeeTaxReport(req, true);
    res.json(createResponse(payload, 'Salary tax recalculated'));
  } catch (error) {
    next(error);
  }
});
