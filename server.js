import express from 'express';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.OLAIA_DATABASE_URL,
});

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const normalized = email.trim().toLowerCase();

  let isNewSignup;
  try {
    const result = await pool.query(
      'INSERT INTO signups (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING id',
      [normalized]
    );
    isNewSignup = result.rowCount > 0;
  } catch (e) {
    console.error('signup insert failed', e);
    return res.status(500).json({ error: 'Server error' });
  }

  if (isNewSignup) {
    try {
      await fetch(process.env.OLAIA_EMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OLAIA_EMAIL_TOKEN}`,
        },
        body: JSON.stringify({
          template_slug: 'signup-welcome',
          to: normalized,
          variables: {},
          idempotency_key: `signup-welcome-${normalized}`,
        }),
      });
    } catch (e) {
      console.error('welcome email failed', e);
    }
  }

  res.json({ ok: true });
});

app.get('/admin/emails', async (req, res) => {
  const bearer = (req.headers.authorization || '').replace('Bearer ', '');
  const password = req.query.password || bearer;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { rows } = await pool.query('SELECT email, created_at FROM signups ORDER BY created_at DESC');
  res.json({ count: rows.length, signups: rows });
});

app.listen(3000, () => console.log('Lumino running on :3000'));
