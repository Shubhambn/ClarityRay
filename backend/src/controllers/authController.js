import { login, signup } from '../services/authService.js';

export async function signupController(req, res, next) {
  try {
    const response = await signup(req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

export async function loginController(req, res, next) {
  try {
    const response = await login(req.body);
    res.json(response);
  } catch (error) {
    next(error);
  }
}
