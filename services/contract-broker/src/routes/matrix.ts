import { Router, Request, Response } from 'express';
import { getMatrix, canIDeploy } from '../matrix/matrix-service';

const router = Router();

/**
 * GET /matrix
 * Return all matrix entries. Supports optional ?service query parameter
 * to filter by consumer or provider name.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const service = req.query.service as string | undefined;
    const entries = await getMatrix(service);
    return res.status(200).json(entries);
  } catch (error) {
    console.error('Error fetching matrix:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /matrix/can-i-deploy
 * Check whether a specific service version is safe to deploy.
 * Requires ?service and ?version query parameters.
 * Returns 400 if either is missing.
 */
router.get('/can-i-deploy', async (req: Request, res: Response) => {
  try {
    const service = req.query.service as string | undefined;
    const version = req.query.version as string | undefined;

    const missingParams: string[] = [];
    if (!service) {
      missingParams.push('service');
    }
    if (!version) {
      missingParams.push('version');
    }

    if (missingParams.length > 0) {
      return res.status(400).json({
        error: 'Missing required query parameters',
        details: missingParams.map(param => `Missing required parameter: ${param}`),
      });
    }

    const result = await canIDeploy(service!, version!);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error checking can-i-deploy:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
