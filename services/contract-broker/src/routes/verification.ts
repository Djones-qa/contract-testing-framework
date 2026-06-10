import { Router, Request, Response } from 'express';
import { contractRepository } from '../db/contract-repository';
import { verificationRepository } from '../db/verification-repository';

const router = Router();

/**
 * POST /contracts/:id/verify
 * Submit a verification result for a contract.
 * Validates that providerVersion and interactions array are present.
 * Returns 404 if contract doesn't exist, 400 if missing required fields.
 */
router.post('/contracts/:id/verify', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if contract exists
    const contract = await contractRepository.findById(id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const { providerVersion, interactions, success, executedAt } = req.body;

    // Validate required fields
    const missingFields: string[] = [];
    if (!providerVersion) {
      missingFields.push('providerVersion');
    }
    if (!interactions || !Array.isArray(interactions)) {
      missingFields.push('interactions');
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: missingFields.map(field => `Missing required field: ${field}`),
      });
    }

    // Determine overall success from interactions if not explicitly provided
    const overallSuccess = success !== undefined
      ? success
      : interactions.every((i: { success: boolean }) => i.success);

    // Store the verification result
    const verificationResultId = await verificationRepository.store(
      id,
      contract.provider,
      {
        providerVersion,
        success: overallSuccess,
        interactions,
        executedAt,
      }
    );

    return res.status(201).json({
      id: verificationResultId,
      contractId: id,
      success: overallSuccess,
    });
  } catch (error) {
    console.error('Error storing verification result:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
