export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // =========================
      // صفحه‌های سایت
      // =========================

      if (url.pathname === "/") {
        return env.ASSETS.fetch(
          new Request(new URL("/index.html", request.url), request)
        );
      }

      if (url.pathname === "/teacher") {
        return env.ASSETS.fetch(
          new Request(new URL("/teacher.html", request.url), request)
        );
      }

      if (url.pathname === "/student") {
        return env.ASSETS.fetch(
          new Request(new URL("/student.html", request.url), request)
        );
      }

      // =========================
      // GET /api/quiz
      // =========================

      if (url.pathname === "/api/quiz" && request.method === "GET") {
        const quiz = await env.DB
          .prepare(`
            SELECT
              id,
              title,
              start_time,
              duration_minutes,
              created_at
            FROM quizzes
            ORDER BY id DESC
            LIMIT 1
          `)
          .first();

        if (!quiz) {
          return json(null);
        }

        const questions = await env.DB
          .prepare(`
            SELECT
              id,
              position,
              a,
              b,
              correct_answer
            FROM questions
            WHERE quiz_id = ?
            ORDER BY position ASC
          `)
          .bind(quiz.id)
          .all();

        return json({
          title: quiz.title,

          // برای teacher.html
          startAt: quiz.start_time,
          durationMinutes: quiz.duration_minutes,

          // برای student.html
          startTime: quiz.start_time,
          duration: quiz.duration_minutes,

          questions: questions.results.map(q => ({
            id: q.id,
            a: q.a,
            b: q.b,
            answer: q.correct_answer
          }))
        });
      }

      // =========================
      // POST /api/quiz
      // =========================

      if (url.pathname === "/api/quiz" && request.method === "POST") {
        const body = await request.json();

        const title = body.title || "آزمون ریاضی";
        const durationMinutes =
          Number(body.durationMinutes) > 0
            ? Number(body.durationMinutes)
            : 20;

        const startAt = body.startAt || null;

        const questions = Array.isArray(body.questions)
          ? body.questions
          : [];

        // نسخه قبلی server.js فقط یک آزمون نگه می‌داشت.
        // بنابراین آزمون قبلی و پاسخ‌هایش را پاک می‌کنیم.

        const oldQuizzes = await env.DB
          .prepare(`SELECT id FROM quizzes`)
          .all();

        for (const oldQuiz of oldQuizzes.results) {
          const oldSubmissions = await env.DB
            .prepare(`
              SELECT id
              FROM submissions
              WHERE quiz_id = ?
            `)
            .bind(oldQuiz.id)
            .all();

          for (const submission of oldSubmissions.results) {
            await env.DB
              .prepare(`
                DELETE FROM submission_answers
                WHERE submission_id = ?
              `)
              .bind(submission.id)
              .run();
          }

          await env.DB
            .prepare(`
              DELETE FROM submissions
              WHERE quiz_id = ?
            `)
            .bind(oldQuiz.id)
            .run();

          await env.DB
            .prepare(`
              DELETE FROM questions
              WHERE quiz_id = ?
            `)
            .bind(oldQuiz.id)
            .run();
        }

        await env.DB
          .prepare(`DELETE FROM quizzes`)
          .run();

        // ساخت آزمون جدید
        const createdAt = new Date().toISOString();

        const quizResult = await env.DB
          .prepare(`
            INSERT INTO quizzes
              (title, start_time, duration_minutes, created_at)
            VALUES (?, ?, ?, ?)
          `)
          .bind(
            title,
            startAt,
            durationMinutes,
            createdAt
          )
          .run();

        const quizId = quizResult.meta.last_row_id;

        // ساخت سؤال‌ها
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];

          await env.DB
            .prepare(`
              INSERT INTO questions
                (quiz_id, position, a, b, correct_answer)
              VALUES (?, ?, ?, ?, ?)
            `)
            .bind(
              quizId,
              i,
              Number(q.a),
              Number(q.b),
              Number(q.answer)
            )
            .run();
        }

        return json({
          title,
          startAt,
          durationMinutes,
          startTime: startAt,
          duration: durationMinutes,
          questions: questions.map((q, i) => ({
            id: i + 1,
            a: Number(q.a),
            b: Number(q.b),
            answer: Number(q.answer)
          }))
        });
      }

      // =========================
      // POST /api/answers
      // =========================

      if (url.pathname === "/api/answers" && request.method === "POST") {
        const body = await request.json();

        const quiz = await env.DB
          .prepare(`
            SELECT id
            FROM quizzes
            ORDER BY id DESC
            LIMIT 1
          `)
          .first();

        if (!quiz) {
          return json(
            { ok: false, error: "آزمونی وجود ندارد." },
            400
          );
        }

        const answers = Array.isArray(body.answers)
          ? body.answers
          : [];

        const questions = await env.DB
          .prepare(`
            SELECT id, position, correct_answer
            FROM questions
            WHERE quiz_id = ?
            ORDER BY position ASC
          `)
          .bind(quiz.id)
          .all();

        let correct = 0;
        let blank = 0;

        const checkedAnswers = questions.results.map((question, index) => {
          const submitted = answers[index];
          const rawAnswer =
            submitted && submitted.answer !== null &&
            submitted && submitted.answer !== undefined
              ? submitted.answer
              : null;

          const answer =
            rawAnswer === null || rawAnswer === ""
              ? null
              : Number(rawAnswer);

          if (answer === null) {
            blank++;
          }

          const isCorrect =
            answer !== null &&
            answer === Number(question.correct_answer);

          if (isCorrect) {
            correct++;
          }

          return {
            questionId: question.id,
            answer,
            isCorrect
          };
        });

        const total = questions.results.length;
        const wrong = total - correct - blank;
        const percentage =
          total > 0 ? (correct / total) * 100 : 0;

        const submittedAt = new Date().toISOString();

        const submissionResult = await env.DB
          .prepare(`
            INSERT INTO submissions
              (
                quiz_id,
                student_name,
                score,
                total,
                percentage,
                submitted_at
              )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(
            quiz.id,
            String(body.name || "بدون نام"),
            correct,
            total,
            percentage,
            submittedAt
          )
          .run();

        const submissionId = submissionResult.meta.last_row_id;

        for (const item of checkedAnswers) {
          await env.DB
            .prepare(`
              INSERT INTO submission_answers
                (
                  submission_id,
                  question_id,
                  answer,
                  is_correct
                )
              VALUES (?, ?, ?, ?)
            `)
            .bind(
              submissionId,
              item.questionId,
              item.answer,
              item.isCorrect ? 1 : 0
            )
            .run();
        }

        return json({
          ok: true,
          score: correct,
          correct,
          wrong,
          blank,
          total,
          percentage
        });
      }

      // =========================
      // GET /api/results
      // =========================

      if (url.pathname === "/api/results" && request.method === "GET") {
        const quiz = await env.DB
          .prepare(`
            SELECT
              id,
              title,
              start_time,
              duration_minutes,
              created_at
            FROM quizzes
            ORDER BY id DESC
            LIMIT 1
          `)
          .first();

        if (!quiz) {
          return json({
            quiz: null,
            answers: []
          });
        }

        const submissions = await env.DB
          .prepare(`
            SELECT
              student_name,
              score,
              total,
              percentage,
              submitted_at
            FROM submissions
            WHERE quiz_id = ?
            ORDER BY id DESC
          `)
          .bind(quiz.id)
          .all();

        return json({
          quiz: {
            title: quiz.title,
            startAt: quiz.start_time,
            durationMinutes: quiz.duration_minutes,
            startTime: quiz.start_time,
            duration: quiz.duration_minutes
          },

          answers: submissions.results.map(row => ({
            name: row.student_name,
            score: row.score,
            total: row.total,
            percentage: row.percentage,
            submittedAt: row.submitted_at
          }))
        });
      }

      // =========================
      // فایل‌های استاتیک
      // =========================

      return env.ASSETS.fetch(request);

    } catch (error) {
      return json(
        {
          ok: false,
          error: error.message
        },
        500
      );
    }
  }
};


// =========================
// JSON Response Helper
// =========================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8"
      }
    }
  );
}
