import { Router, type NextFunction, type Request, type Response } from 'express';
import Joi from 'joi';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse } from '../../helpers/response';
import { LanguageSetting } from '../../models/LanguageSetting';

const router = Router();

const languageSchema = Joi.object({
  body: Joi.object({
    language: Joi.string().valid('en', 'fa', 'ps').required()
  })
});

router.use(authenticate);

async function getCurrentLanguageSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const setting = await LanguageSetting.findOne({
      userId: req.user!.userId,
      key: 'app_language',
      isDeleted: false
    }).lean();

    res.json(createResponse(setting ?? { language: 'en' }));
  } catch (error) {
    next(error);
  }
}

router.get('/', getCurrentLanguageSetting);
router.get('/current', getCurrentLanguageSetting);

router.put('/current', validate(languageSchema), async (req, res, next) => {
  try {
    const setting = await LanguageSetting.findOneAndUpdate(
      { userId: req.user!.userId, key: 'app_language' },
      {
        userId: req.user!.userId,
        key: 'app_language',
        scope: 'user',
        language: req.body.language
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    res.json(createResponse(setting, 'Language updated successfully'));
  } catch (error) {
    next(error);
  }
});

export const languageSettingRouter = router;
