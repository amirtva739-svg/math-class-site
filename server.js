import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

const DB = path.join(__dirname, 'data.json');

if (!fs.existsSync(DB)) {
  fs.writeFileSync(
    DB,
    JSON.stringify({ quiz: null, answers: [] }, null, 2)
  );
}

const read = () => JSON.parse(fs.readFileSync(DB, 'utf8'));

const write = (data) => {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
};

// تست مستقیم سرور
app.get('/', (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>کلاس ریاضی</title>
    </head>
    <body>
      <h1>سایت کلاس ریاضی فعال است</h1>
      <p>سرور با موفقیت اجرا شده است.</p>
      <p><a href="/teacher">ورود معلم</a></p>
      <p><a href="/student">ورود دانش‌آموز</a></p>
    </body>
    </html>
  `);
});

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'teacher.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'student.html'));
});

app.get('/api/quiz', (req, res) => {
  res.json(read().quiz);
});

app.post('/api/quiz', (req, res) => {
  const data = read();

  data.quiz = req.body;
  data.answers = [];

  write(data);

  res.json(data.quiz);
});

app.post('/api/answers', (req, res) => {
  const data = read();

  data.answers.push({
    ...req.body,
    submittedAt: new Date().toISOString()
  });

  write(data);

  res.json({ ok: true });
});

app.get('/api/results', (req, res) => {
  const data = read();

  res.json({
    quiz: data.quiz,
    answers: data.answers
  });
});

const PORT = Number(process.env.PORT) || 10000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;
