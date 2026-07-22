"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const response_1 = require("../helpers/response");
function validate(schema) {
    return (req, res, next) => {
        const context = { body: req.body, query: req.query, params: req.params };
        const validated = schema.validate(context, { abortEarly: false, stripUnknown: true });
        if (!validated.error && typeof validated.value === 'object') {
            const value = validated.value;
            if (value.body !== undefined)
                req.body = value.body;
            if (value.query !== undefined)
                req.query = value.query;
            if (value.params !== undefined)
                req.params = value.params;
            return next();
        }
        const queryValidation = schema.validate(req.query, { abortEarly: false, stripUnknown: true });
        if (!queryValidation.error) {
            req.query = queryValidation.value;
            return next();
        }
        const bodyValidation = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (!bodyValidation.error) {
            req.body = bodyValidation.value;
            return next();
        }
        const errors = [validated.error, queryValidation.error, bodyValidation.error]
            .filter(Boolean)
            .flatMap((err) => err?.details.map((item) => item.message) ?? []);
        return res.status(400).json((0, response_1.createError)(errors.join(', ')));
    };
}
