import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { 
  CreateInterviewRoundSchema, 
  UpdateInterviewRoundSchema,
  RecordConsentSchema 
} from '../types/schemas';
import { createVideoSDKRoom } from '../services/videosdk';

const router = Router();

/**
 * Create a new interview round
 * POST /api/rounds
 * Access: HR, ADMIN
 */
router.post('/', authenticateJWT, requireRole('HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = CreateInterviewRoundSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.issues 
      });
      return;
    }

    const data = validationResult.data;

    // Create VideoSDK room for human-assisted interviews
    let videosdkMeetingId = null;
    let videosdkToken = null;

    if (data.interviewMode === 'HUMAN_AI_ASSISTED') {
      const room = await createVideoSDKRoom();
      videosdkMeetingId = room.meetingId;
      videosdkToken = room.token;
    }

    const result = await pool.query(
      `INSERT INTO interview_rounds (
        external_interview_id,
        external_candidate_id,
        external_interviewer_id,
        external_job_role_id,
        round_number,
        round_type,
        interview_mode,
        scheduled_at,
        scheduled_duration_minutes,
        videosdk_meeting_id,
        videosdk_token
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        data.externalInterviewId,
        data.externalCandidateId,
        data.externalInterviewerId,
        data.externalJobRoleId,
        data.roundNumber,
        data.roundType,
        data.interviewMode,
        data.scheduledAt,
        data.scheduledDurationMinutes,
        videosdkMeetingId,
        videosdkToken,
      ]
    );

    logger.info('Interview round created', { roundId: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating interview round', { error });
    res.status(500).json({ error: 'Failed to create interview round' });
  }
});

/**
 * Get interview round by ID
 * GET /api/rounds/:roundId
 * Access: Authenticated users (with permission check)
 */
router.get('/:roundId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    const result = await pool.query(
      'SELECT * FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    const round = result.rows[0];

    // Permission check
    if (req.user?.role === 'CANDIDATE' && round.external_candidate_id !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (req.user?.role === 'EMPLOYEE' && round.external_interviewer_id !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(round);
  } catch (error) {
    logger.error('Error fetching interview round', { error });
    res.status(500).json({ error: 'Failed to fetch interview round' });
  }
});

/**
 * Update interview round status
 * PATCH /api/rounds/:roundId
 * Access: HR, ADMIN, assigned EMPLOYEE
 */
router.patch('/:roundId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;
    const validationResult = UpdateInterviewRoundSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.issues 
      });
      return;
    }

    const data = validationResult.data;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);

      // Set timestamps based on status
      if (data.status === 'IN_PROGRESS') {
        updates.push(`started_at = $${paramIndex++}`);
        values.push(new Date().toISOString());
      } else if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
        updates.push(`ended_at = $${paramIndex++}`);
        values.push(new Date().toISOString());
      }
    }

    if (data.scheduledAt) {
      updates.push(`scheduled_at = $${paramIndex++}`);
      values.push(data.scheduledAt);
    }

    if (data.videosdkMeetingId) {
      updates.push(`videosdk_meeting_id = $${paramIndex++}`);
      values.push(data.videosdkMeetingId);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No updates provided' });
      return;
    }

    values.push(roundId);

    const result = await pool.query(
      `UPDATE interview_rounds SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    logger.info('Interview round updated', { roundId, updates: data });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating interview round', { error });
    res.status(500).json({ error: 'Failed to update interview round' });
  }
});

/**
 * Record candidate consent for AI monitoring
 * POST /api/rounds/:roundId/consent
 * Access: CANDIDATE
 */
router.post('/:roundId/consent', authenticateJWT, requireRole('CANDIDATE'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;
    const { consentGiven } = req.body;

    if (typeof consentGiven !== 'boolean') {
      res.status(400).json({ error: 'consentGiven must be a boolean' });
      return;
    }

    const result = await pool.query(
      `UPDATE interview_rounds 
       SET candidate_consent_given = $1, 
           candidate_consent_timestamp = $2,
           status = CASE WHEN $1 = true THEN 'WAITING_FOR_INTERVIEWER' ELSE status END
       WHERE id = $3 AND external_candidate_id = $4
       RETURNING *`,
      [consentGiven, new Date().toISOString(), roundId, req.user?.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found or access denied' });
      return;
    }

    logger.info('Consent recorded', { roundId, consentGiven, candidateId: req.user?.id });
    res.json({ success: true, consentGiven, round: result.rows[0] });
  } catch (error) {
    logger.error('Error recording consent', { error });
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

/**
 * Start interview (interviewer joins)
 * POST /api/rounds/:roundId/start
 * Access: EMPLOYEE (interviewer), HR, ADMIN
 */
router.post('/:roundId/start', authenticateJWT, requireRole('EMPLOYEE', 'HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    // Get current round
    const roundResult = await pool.query(
      'SELECT * FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (roundResult.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    const round = roundResult.rows[0];

    // Check if candidate has given consent
    if (!round.candidate_consent_given) {
      res.status(400).json({ error: 'Candidate has not given consent yet' });
      return;
    }

    // Update status to IN_PROGRESS
    const result = await pool.query(
      `UPDATE interview_rounds 
       SET status = 'IN_PROGRESS', started_at = $1 
       WHERE id = $2 
       RETURNING *`,
      [new Date().toISOString(), roundId]
    );

    logger.info('Interview started', { roundId, interviewerId: req.user?.id });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error starting interview', { error });
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

/**
 * End interview
 * POST /api/rounds/:roundId/end
 * Access: EMPLOYEE (interviewer), HR, ADMIN
 */
router.post('/:roundId/end', authenticateJWT, requireRole('EMPLOYEE', 'HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    const result = await pool.query(
      `UPDATE interview_rounds 
       SET status = 'COMPLETED', ended_at = $1 
       WHERE id = $2 
       RETURNING *`,
      [new Date().toISOString(), roundId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    logger.info('Interview ended', { roundId, interviewerId: req.user?.id });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error ending interview', { error });
    res.status(500).json({ error: 'Failed to end interview' });
  }
});

/**
 * Get interviews for current user
 * GET /api/rounds
 * Access: Authenticated users
 */
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = '';
    let values: string[] = [];

    switch (req.user?.role) {
      case 'CANDIDATE':
        query = 'SELECT * FROM interview_rounds WHERE external_candidate_id = $1 ORDER BY scheduled_at DESC';
        values = [req.user.id];
        break;
      case 'EMPLOYEE':
        query = 'SELECT * FROM interview_rounds WHERE external_interviewer_id = $1 ORDER BY scheduled_at DESC';
        values = [req.user.id];
        break;
      case 'HR':
      case 'ADMIN':
        query = 'SELECT * FROM interview_rounds ORDER BY scheduled_at DESC LIMIT 100';
        break;
      default:
        res.status(403).json({ error: 'Access denied' });
        return;
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching interview rounds', { error });
    res.status(500).json({ error: 'Failed to fetch interview rounds' });
  }
});

export default router;
