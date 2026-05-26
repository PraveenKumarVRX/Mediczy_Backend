import { All, Controller, Req, Res } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';

const UPSTREAM = 'https://app.mediqzy.com';

@Controller()
export class ProxyController {
  constructor(private readonly http: HttpService) {}

  @All('api/*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const url = `${UPSTREAM}${req.originalUrl}`;

    const headers: Record<string, string> = {
      'content-type': (req.headers['content-type'] as string) || 'application/json',
    };
    if (req.headers.authorization) headers['authorization'] = req.headers.authorization as string;
    if (req.headers.cookie) headers['cookie'] = req.headers.cookie;

    try {
      const upstream = await firstValueFrom(
        this.http.request({
          method: req.method as any,
          url,
          headers,
          data: Object.keys(req.body || {}).length ? req.body : undefined,
          validateStatus: () => true,
          timeout: 30000,
        }),
      );

      // Forward any set-cookie headers
      const setCookie = upstream.headers['set-cookie'];
      if (setCookie) res.setHeader('set-cookie', setCookie);

      res.status(upstream.status).json(upstream.data);
    } catch (err: any) {
      res.status(502).json({ success: false, error: 'upstream_unavailable', message: err.message });
    }
  }
}
