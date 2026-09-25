export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {

      // =====================================================
      // صفحات
      // =====================================================

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


      // =====================================================
      // GET /api/quiz
      // دریافت آخرین آزمون
      // =====================================================

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
              correct_answer,
              type,
              question_text,
              options_json,
              answer_index
            FROM questions
            WHERE quiz_id = ?
            ORDER BY position ASC
          `)
          .bind(quiz.id)
          .all();


        const formattedQuestions = questions.results.map(q => {

          const type = q.type || "multiplication";

          // -----------------------------
          // سؤال هندسه
          // -----------------------------

          if (type === "geometry") {

            let options = [];

            try {
              options = q.options_json
                ? JSON.parse(q.options_json)
                : [];
            } catch {
              options = [];
            }

            return {
              id: q.id,
              type: "geometry",
              questionText: q.question_text || "",
              options,
              answerIndex:
                q.answer_index !== null &&
                q.answer_index !== undefined
                  ? Number(q.answer_index)
                  : 0
            };
          }


          // -----------------------------
          // سؤال ضرب
          // -----------------------------

          return {
            id: q.id,
            type: "multiplication",
            a: Number(q.a),
            b: Number(q.b),
            answer: Number(q.correct_answer)
          };
        });


        return json({
          title: quiz.title,

          // teacher
          startAt: quiz.start_time,
          durationMinutes: quiz.duration_minutes,

          // student
          startTime: quiz.start_time,
          duration: quiz.duration_minutes,

          questions: formattedQuestions
        });
      }


      // =====================================================
      // POST /api/quiz
      // ساخت و انتشار آزمون
      // =====================================================

      if (url.pathname === "/api/quiz" && request.method === "POST") {

        const body = await request.json();

        const title =
          String(body.title || "آزمون ریاضی").trim();

        const durationMinutes =
          Number(body.durationMinutes) > 0
            ? Number(body.durationMinutes)
            : 20;

        const startAt =
          body.startAt || null;

        const questions =
          Array.isArray(body.questions)
            ? body.questions
            : [];


        if (questions.length === 0) {
          return json(
            {
              ok: false,
              error: "هیچ سؤالی وجود ندارد."
            },
            400
          );
        }


        // =================================================
        // حذف آزمون قبلی
        // =================================================

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


        // =================================================
        // ساخت آزمون
        // =================================================

        const createdAt =
          new Date().toISOString();


        const quizResult = await env.DB
          .prepare(`
            INSERT INTO quizzes
              (
                title,
                start_time,
                duration_minutes,
                created_at
              )
            VALUES (?, ?, ?, ?)
          `)
          .bind(
            title,
            startAt,
            durationMinutes,
            createdAt
          )
          .run();


        const quizId =
          quizResult.meta.last_row_id;


        // =================================================
        // ذخیره سؤال‌ها
        // =================================================

        for (let i = 0; i < questions.length; i++) {

          const q = questions[i];

          const type =
            q.type === "geometry"
              ? "geometry"
              : "multiplication";


          // ===============================================
          // هندسه
          // ===============================================

          if (type === "geometry") {

            const questionText =
              String(q.questionText || "").trim();


            const options =
              Array.isArray(q.options)
                ? q.options.map(x => String(x))
                : [];


            let answerIndex =
              Number(q.answerIndex);


            if (
              !Number.isInteger(answerIndex) ||
              answerIndex < 0 ||
              answerIndex >= options.length
            ) {
              answerIndex = 0;
            }


            await env.DB
              .prepare(`
                INSERT INTO questions
                  (
                    quiz_id,
                    position,
                    a,
                    b,
                    correct_answer,
                    type,
                    question_text,
                    options_json,
                    answer_index
                  )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `)
              .bind(
                quizId,
                i,
                0,
                0,
                answerIndex,
                "geometry",
                questionText,
                JSON.stringify(options),
                answerIndex
              )
              .run();


            continue;
          }


          // ===============================================
          // ضرب
          // ===============================================

          const a = Number(q.a);
          const b = Number(q.b);
          const answer = Number(q.answer);


          if (
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            !Number.isFinite(answer)
          ) {
            return json(
              {
                ok: false,
                error: `سؤال ${i + 1} نامعتبر است.`
              },
              400
            );
          }


          await env.DB
            .prepare(`
              INSERT INTO questions
                (
                  quiz_id,
                  position,
                  a,
                  b,
                  correct_answer,
                  type,
                  question_text,
                  options_json,
                  answer_index
                )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(
              quizId,
              i,
              a,
              b,
              answer,
              "multiplication",
              null,
              null,
              null
            )
            .run();
        }


        // =================================================
        // پاسخ
        // =================================================

        return json({
          ok: true,

          title,
          startAt,
          durationMinutes,

          startTime: startAt,
          duration: durationMinutes,

          questions: questions.map((q, index) => {

            if (q.type === "geometry") {

              return {
                id: index + 1,
                type: "geometry",
                questionText:
                  String(q.questionText || ""),
                options:
                  Array.isArray(q.options)
                    ? q.options
                    : [],
                answerIndex:
                  Number(q.answerIndex) || 0
              };
            }


            return {
              id: index + 1,
              type: "multiplication",
              a: Number(q.a),
              b: Number(q.b),
              answer: Number(q.answer)
            };
          })
        });
      }


      // =====================================================
      // POST /api/answers
      // ثبت پاسخ دانش‌آموز
      // =====================================================

      if (
        url.pathname === "/api/answers" &&
        request.method === "POST"
      ) {

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
            {
              ok: false,
              error: "آزمونی وجود ندارد."
            },
            400
          );
        }


        const answers =
          Array.isArray(body.answers)
            ? body.answers
            : [];


        const questions = await env.DB
          .prepare(`
            SELECT
              id,
              position,
              correct_answer,
              type,
              answer_index
            FROM questions
            WHERE quiz_id = ?
            ORDER BY position ASC
          `)
          .bind(quiz.id)
          .all();


        let correct = 0;
        let blank = 0;


        const checkedAnswers =
          questions.results.map((question, index) => {

            const submitted =
              answers[index];


            const rawAnswer =
              submitted &&
              submitted.answer !== null &&
              submitted.answer !== undefined
                ? submitted.answer
                : null;


            const answer =
              rawAnswer === null ||
              rawAnswer === ""
                ? null
                : Number(rawAnswer);


            if (answer === null) {
              blank++;
            }


            let isCorrect = false;


            // هندسه
            if (question.type === "geometry") {

              isCorrect =
                answer !== null &&
                answer ===
                  Number(question.answer_index);

            }

            // ضرب
            else {

              isCorrect =
                answer !== null &&
                answer ===
                  Number(question.correct_answer);
            }


            if (isCorrect) {
              correct++;
            }


            return {
              questionId: question.id,
              answer,
              isCorrect
            };
          });


        const total =
          questions.results.length;


        const wrong =
          total - correct - blank;


        const percentage =
          total > 0
            ? (correct / total) * 100
            : 0;


        const submittedAt =
          new Date().toISOString();


        // =================================================
        // ذخیره نتیجه
        // =================================================

        const submissionResult =
          await env.DB
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


        const submissionId =
          submissionResult.meta.last_row_id;


        // =================================================
        // ذخیره پاسخ سؤال‌ها
        // =================================================

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


      // =====================================================
      // GET /api/results
      // نتایج دانش‌آموزان
      // =====================================================

      if (
        url.pathname === "/api/results" &&
        request.method === "GET"
      ) {

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


        const submissions =
          await env.DB
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
            durationMinutes:
              quiz.duration_minutes,
            startTime: quiz.start_time,
            duration:
              quiz.duration_minutes
          },

          answers:
            submissions.results.map(row => ({
              name: row.student_name,
              score: row.score,
              total: row.total,
              percentage:
                row.percentage,
              submittedAt:
                row.submitted_at
            }))
        });
      }


      // =====================================================
      // فایل‌های استاتیک
      // =====================================================

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


// =========================================================
// JSON Helper
// =========================================================

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "content-type":
          "application/json; charset=UTF-8"
      }
    }
  );
}
