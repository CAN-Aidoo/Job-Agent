import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { dbProfiles } from '@jobagent/shared/src/index';
import { getPool } from '@jobagent/shared/src/db/client';
import { Profile, Seniority } from '@jobagent/shared/src/interfaces/profile';

const router = Router();
router.use(authMiddleware);

// File upload config — local storage for dev, S3 in production
const uploadsDir = path.resolve(__dirname, '../../../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const VALID_SENIORITIES: Seniority[] = ['junior', 'mid', 'senior', 'staff', 'principal'];

function validateProfile(data: Partial<Profile>): string | null {
  if (!data.full_name || data.full_name.trim().length === 0) return 'full_name is required';
  if (!data.email || data.email.trim().length === 0) return 'email is required';
  if (!data.target_roles || data.target_roles.length === 0) return 'target_roles must not be empty';
  if (!data.stack || data.stack.length === 0) return 'stack must not be empty';
  if (!data.seniority || !VALID_SENIORITIES.includes(data.seniority)) {
    return `seniority must be one of: ${VALID_SENIORITIES.join(', ')}`;
  }
  return null;
}

// GET /profile
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const profile = await dbProfiles.findByUserId(userId);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.json(profile);
});

// PUT /profile
router.put('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const data = req.body as Profile;

  const validationError = validateProfile(data);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  data.user_id = userId;
  const saved = await dbProfiles.upsert(userId, data);
  res.json(saved);
});

// POST /profile/resume-variants
router.post('/resume-variants', upload.single('resume'), async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'PDF file is required' });
    return;
  }

  const name = req.body.name || file.originalname.replace('.pdf', '');

  const pool = getPool();
  const { rows } = await pool.query<{ id: string; name: string; file_path: string }>(
    `INSERT INTO resume_variants (user_id, name, file_path, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, file_path`,
    [userId, name, file.path, JSON.stringify({ originalName: file.originalname, size: file.size })]
  );

  res.status(201).json(rows[0]);
});

// DELETE /profile/resume-variants/:id
router.delete('/resume-variants/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const pool = getPool();
  const { rows } = await pool.query<{ file_path: string }>(
    'DELETE FROM resume_variants WHERE id = $1 AND user_id = $2 RETURNING file_path',
    [id, userId]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: 'Resume variant not found' });
    return;
  }

  // Delete the file
  try {
    fs.unlinkSync(rows[0].file_path);
  } catch {
    // File may already be deleted
  }

  res.json({ success: true });
});

// GET /profile/resume-variants
router.get('/resume-variants', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, file_path, metadata FROM resume_variants WHERE user_id = $1',
    [userId]
  );
  res.json(rows);
});

export default router;
