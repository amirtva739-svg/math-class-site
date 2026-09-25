import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.json());

// فایل‌های سایت مستقیماً از پوشه اصلی
app.use(express.static(__dirname));

const DB = path.join(__dirname, 'data.json');

if (!fs.existsSync(DB)) {
  fs.writeFileSync(
    DB,
    JSON.stringify({ quiz: null, answers: [] }, null, 2)
  );
}

const read = () => JSON.parse(fs.readFileSync(DB));
const write = (x) =>
  fs.writeFileSync(DB, JSON.stringify(x, null, 2));

app.get('/api/quiz', (req, res) => {
  res.json(read().quiz);
});

app.post('/api/quiz', (req, res) => {
  const d = read();

  d.quiz = req.body;
  d.answers = [];

  write(d);

  res.json(d.quiz);
});

app.post('/api/answers', (req, res) => {
  const d = read();

  const a = {
    ...req.body,
    submittedAt: new Date().toISOString()
  };

  d.answers.push(a);

  write(d);

  res.json({ ok: true });
});

app.get('/api/results', (req, res) => {
  const d = read();

  res.json({
    quiz: d.quiz,
    answers: d.answers
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'teacher.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'student.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
