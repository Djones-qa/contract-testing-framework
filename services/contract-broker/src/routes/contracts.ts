import { Router, Request, Response } from 'express';
import { validateContract } from '@contract-testing/shared';
import { contractRepository } from '../db/contract-repository';
import { publishContractEvent } from '../redis/event-publisher';

const router = Router();

/**
 * POST /contracts
 * Publish a new contract. Validates using shared contract-validator,
 * stores via repository (upsert for duplicates), emits event to Redis Stream.
 * Returns 201 with contract ID on success.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate the incoming contract data
    const validation = validateContract(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    const { consumer, provider, version, interactions } = req.body;

    // Normalize interactions to include defaults for optional fields
    const normalizedInteractions = interactions.map((interaction: Record<string, unknown>) => ({
      description: interaction.description,
      providerStates: interaction.providerStates || [],
      request: interaction.request,
      response: interaction.response,
      matchingRules: interaction.matchingRules || [],
    }));

    // Upsert handles both new and duplicate (consumer, provider, version) contracts
    const contract = await contractRepository.upsert({
      consumer,
      provider,
      version,
      status: 'active',
      interactions: normalizedInteractions,
    });

    // Emit contract-published event to Redis Stream (non-blocking on failure)
    await publishContractEvent({
      contractId: contract.id,
      consumer: contract.consumer,
      provider: contract.provider,
      version: contract.version,
      timestamp: new Date(),
    });

    return res.status(201).json({ id: contract.id });
  } catch (error) {
    console.error('Error publishing contract:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /contracts
 * List all active contracts (metadata only, ContractSummary[]).
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const contracts = await contractRepository.findActive();
    return res.status(200).json(contracts);
  } catch (error) {
    console.error('Error listing contracts:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /contracts/consumer/:name
 * Filter active contracts by consumer name.
 */
router.get('/consumer/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const contracts = await contractRepository.findByConsumer(name);
    return res.status(200).json(contracts);
  } catch (error) {
    console.error('Error finding contracts by consumer:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /contracts/provider/:name
 * Filter active contracts by provider name.
 */
router.get('/provider/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const contracts = await contractRepository.findByProvider(name);
    return res.status(200).json(contracts);
  } catch (error) {
    console.error('Error finding contracts by provider:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /contracts/:id
 * Return full contract by ID, or 404 if not found.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findById(id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    return res.status(200).json(contract);
  } catch (error) {
    console.error('Error fetching contract:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /contracts/:id
 * Archive a contract. Returns 200 with the archived contract, or 404 if not found.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.archive(id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    return res.status(200).json(contract);
  } catch (error) {
    console.error('Error archiving contract:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
