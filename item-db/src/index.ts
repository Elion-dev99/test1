import type { Env } from './types';
import { handleApi } from './api';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
