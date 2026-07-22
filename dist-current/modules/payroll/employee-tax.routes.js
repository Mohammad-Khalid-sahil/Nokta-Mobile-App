"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.employeeTaxRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middlewares/auth");
const response_1 = require("../../helpers/response");
const employeeTax_service_1 = require("../../services/employeeTax.service");
exports.employeeTaxRouter = (0, express_1.Router)();
exports.employeeTaxRouter.use(auth_1.authenticate);
exports.employeeTaxRouter.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const payload = await (0, employeeTax_service_1.buildEmployeeTaxReport)(req, false);
        res.json((0, response_1.createResponse)(payload));
    }
    catch (error) {
        next(error);
    }
});
exports.employeeTaxRouter.post('/recalculate', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const payload = await (0, employeeTax_service_1.buildEmployeeTaxReport)(req, true);
        res.json((0, response_1.createResponse)(payload, 'Salary tax recalculated'));
    }
    catch (error) {
        next(error);
    }
});
