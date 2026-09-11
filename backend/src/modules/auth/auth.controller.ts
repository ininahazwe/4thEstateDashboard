import { Request, Response } from 'express';
import { z } from 'zod';
import { login } from './auth.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const result = await login(email, password);
  res.json(result);
}
