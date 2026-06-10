import { Router, Request, Response } from 'express';
import { create, list, destroy } from '../stub-manager/stub-manager';

const router = Router();

/**
 * POST /stubs
 * Create a stub from a contract ID.
 * Returns 201 with stub ID and port on success.
 * Returns 404 if contract not found at broker.
 * Returns 400 if contractId is missing from request body.
 */
router.post('/', async (req: Request, res: Response) => {
  const { contractId } = req.body;

  if (!contractId) {
    res.status(400).json({ error: 'contractId is required' });
    return;
  }

  try {
    const stubInfo = await create(contractId);

    if (!stubInfo) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    res.status(201).json({
      id: stubInfo.id,
      port: stubInfo.port,
      contractId: stubInfo.contractId,
      consumer: stubInfo.consumer,
      provider: stubInfo.provider,
      createdAt: stubInfo.createdAt,
    });
  } catch (error) {
    console.error('Error creating stub:', error);
    res.status(500).json({ error: 'Failed to create stub' });
  }
});

/**
 * GET /stubs
 * List all active stubs with their assigned ports and contract references.
 */
router.get('/', (_req: Request, res: Response) => {
  const stubs = list();
  res.status(200).json(stubs);
});

/**
 * DELETE /stubs/:id
 * Destroy a stub by ID.
 * Returns 200 on success.
 * Returns 404 if stub not found.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const destroyed = await destroy(id);

    if (!destroyed) {
      res.status(404).json({ error: 'Stub not found' });
      return;
    }

    res.status(200).json({ message: 'Stub destroyed' });
  } catch (error) {
    console.error('Error destroying stub:', error);
    res.status(500).json({ error: 'Failed to destroy stub' });
  }
});

export default router;
