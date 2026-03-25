import { Router } from 'express';
import { AuthController } from '@/controllers/AuthController';
import { body, query } from 'express-validator';
import { validateRequest } from '@/middleware/validation';

const router = Router();
const authController = new AuthController();

/**
 * @route GET /api/auth/challenge
 * @desc Get SEP-10 challenge for an account
 */
router.get(
  '/challenge',
  [
    query('account').isString().notEmpty().withMessage('Account address is required'),
  ],
  validateRequest,
  authController.getAuthChallenge.bind(authController)
);

/**
 * @route POST /api/auth/login
 * @desc Login using signed SEP-10 transaction XDR
 */
router.post(
  '/login',
  [
    body('transaction').isString().notEmpty().withMessage('Signed transaction XDR is required'),
  ],
  validateRequest,
  authController.login.bind(authController)
);

export default router;
