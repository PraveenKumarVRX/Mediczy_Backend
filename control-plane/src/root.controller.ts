import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class RootController {
  @Get()
  redirectToAdmin(@Res() res: Response) {
    res.redirect(302, '/admin/login');
  }
}
