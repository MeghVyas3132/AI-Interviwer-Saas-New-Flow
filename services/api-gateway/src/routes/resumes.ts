import { Router, Response } from 'express';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { SaveResumeSchema } from '../types/schemas';

const router = Router();

/**
 * Save or update candidate resume
 * POST /api/resumes
 * Access: HR, ADMIN (or internal service)
 */
router.post('/', authenticateJWT, requireRole('HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = SaveResumeSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.issues 
      });
      return;
    }

    const { externalCandidateId, resumeJson } = validationResult.data;

    // Extract key facts for quick matching
    const keyFacts = extractKeyFacts(resumeJson);

    const result = await pool.query(
      `INSERT INTO candidate_resumes (external_candidate_id, resume_json, key_facts)
       VALUES ($1, $2, $3)
       ON CONFLICT (external_candidate_id) 
       DO UPDATE SET resume_json = $2, key_facts = $3, updated_at = NOW()
       RETURNING *`,
      [externalCandidateId, JSON.stringify(resumeJson), JSON.stringify(keyFacts)]
    );

    logger.info('Resume saved', { candidateId: externalCandidateId });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error saving resume', { error });
    res.status(500).json({ error: 'Failed to save resume' });
  }
});

/**
 * Get candidate resume
 * GET /api/resumes/:candidateId
 * Access: HR, ADMIN, assigned EMPLOYEE
 */
router.get('/:candidateId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { candidateId } = req.params;

    const result = await pool.query(
      'SELECT * FROM candidate_resumes WHERE external_candidate_id = $1',
      [candidateId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Resume not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching resume', { error });
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

/**
 * Extract key facts from resume for quick contradiction checking
 */
function extractKeyFacts(resume: any) {
  const keyFacts: {
    companies: Array<{ name: string; duration: string; startDate: string; endDate: string }>;
    skills: string[];
    totalExperienceMonths: number;
    education: Array<{ institution: string; degree: string; year: number }>;
    certifications: string[];
  } = {
    companies: [],
    skills: [],
    totalExperienceMonths: 0,
    education: [],
    certifications: [],
  };

  // Extract company info
  if (resume.experience) {
    keyFacts.companies = resume.experience.map((exp: any) => ({
      name: exp.company,
      duration: `${exp.durationMonths || 0} months`,
      startDate: exp.startDate,
      endDate: exp.endDate,
    }));

    keyFacts.totalExperienceMonths = resume.experience.reduce(
      (sum: number, exp: any) => sum + (exp.durationMonths || 0),
      0
    );
  }

  // Extract skills
  if (resume.skills) {
    keyFacts.skills = [
      ...(resume.skills.programmingLanguages || []),
      ...(resume.skills.frameworks || []),
      ...(resume.skills.databases || []),
      ...(resume.skills.tools || []),
    ];
  }

  // Extract education
  if (resume.education) {
    keyFacts.education = resume.education.map((edu: any) => ({
      institution: edu.institution,
      degree: edu.degree,
      year: edu.graduationYear,
    }));
  }

  // Extract certifications
  if (resume.certifications) {
    keyFacts.certifications = resume.certifications.map((cert: any) => cert.name);
  }

  return keyFacts;
}

export default router;
