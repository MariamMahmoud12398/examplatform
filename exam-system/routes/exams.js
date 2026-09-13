const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireTeacher, requireStudent } = require('../middleware/auth');

// ========== TEACHER ROUTES ==========

// إنشاء امتحان جديد
router.post('/', authenticateToken, requireTeacher, (req, res) => {
  const { title, description, duration_minutes, allow_retake } = req.body;
  if (!title || !duration_minutes) {
    return res.status(400).json({ error: 'عنوان الامتحان والمدة الزمنية مطلوبان' });
  }
  const result = db.prepare(
    'INSERT INTO exams (title, description, teacher_id, duration_minutes, allow_retake) VALUES (?, ?, ?, ?, ?)'
  ).run(title, description || '', req.user.id, duration_minutes, allow_retake ? 1 : 0);

  res.status(201).json({ message: 'تم إنشاء الامتحان بنجاح', exam_id: result.lastInsertRowid });
});

// جلب امتحانات المدرس
router.get('/my-exams', authenticateToken, requireTeacher, (req, res) => {
  const exams = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
      (SELECT COUNT(*) FROM exam_attempts WHERE exam_id = e.id AND status = 'submitted') as attempt_count
    FROM exams e WHERE e.teacher_id = ?
    ORDER BY e.created_at DESC
  `).all(req.user.id);
  res.json(exams);
});

// جلب تفاصيل امتحان محدد (للمدرس)
router.get('/:id', authenticateToken, requireTeacher, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?')
    .get(req.params.id, req.user.id);
  if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });

  const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(exam.id);
  res.json({ ...exam, questions });
});

// تعديل امتحان
router.put('/:id', authenticateToken, requireTeacher, (req, res) => {
  const { title, description, duration_minutes, allow_retake, is_active } = req.body;
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?')
    .get(req.params.id, req.user.id);
  if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });

  db.prepare(`
    UPDATE exams SET title=?, description=?, duration_minutes=?, allow_retake=?, is_active=?
    WHERE id=?
  `).run(
    title || exam.title,
    description !== undefined ? description : exam.description,
    duration_minutes || exam.duration_minutes,
    allow_retake !== undefined ? (allow_retake ? 1 : 0) : exam.allow_retake,
    is_active !== undefined ? (is_active ? 1 : 0) : exam.is_active,
    exam.id
  );
  res.json({ message: 'تم تحديث الامتحان بنجاح' });
});

// حذف امتحان
router.delete('/:id', authenticateToken, requireTeacher, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?')
    .get(req.params.id, req.user.id);
  if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });
  db.prepare('DELETE FROM exams WHERE id = ?').run(exam.id);
  res.json({ message: 'تم حذف الامتحان بنجاح' });
});

// إضافة سؤال
router.post('/:id/questions', authenticateToken, requireTeacher, (req, res) => {
  const { question_text, option_a, option_b, option_c, option_d, correct_answer, points } = req.body;
  if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
    return res.status(400).json({ error: 'جميع حقول السؤال مطلوبة' });
  }
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?')
    .get(req.params.id, req.user.id);
  if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });

  const result = db.prepare(`
    INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer, points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(exam.id, question_text, option_a, option_b, option_c, option_d, correct_answer, points || 1);

  res.status(201).json({ message: 'تم إضافة السؤال بنجاح', question_id: result.lastInsertRowid });
});

// حذف سؤال
router.delete('/:examId/questions/:questionId', authenticateToken, requireTeacher, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?')
    .get(req.params.examId, req.user.id);
  if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });
  db.prepare('DELETE FROM questions WHERE id = ? AND exam_id = ?')
    .run(req.params.questionId, exam.id);
  res.json({ message: 'تم حذف السؤال بنجاح' });
});

// درجات الطلاب
router.get('/:id/results', authenticateToken, requireTeacher, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?')
    .get(req.params.id, req.user.id);
  if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });

  const results = db.prepare(`
    SELECT
      u.name as student_name,
      u.email as student_email,
      ea.score,
      ea.total_points,
      ea.started_at,
      ea.submitted_at,
      ea.status,
      ROUND(CAST(ea.score AS REAL) / NULLIF(ea.total_points, 0) * 100, 1) as percentage
    FROM exam_attempts ea
    JOIN users u ON ea.student_id = u.id
    WHERE ea.exam_id = ? AND ea.status = 'submitted'
    ORDER BY ea.submitted_at DESC
  `).all(exam.id);

  res.json({ exam, results });
});

// ========== STUDENT ROUTES ==========

// الامتحانات المتاحة للطالب
router.get('/available/list', authenticateToken, requireStudent, (req, res) => {
  const exams = db.prepare(`
    SELECT
      e.id, e.title, e.description, e.duration_minutes, e.allow_retake,
      u.name as teacher_name,
      (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
      (SELECT COUNT(*) FROM exam_attempts
       WHERE exam_id = e.id AND student_id = ? AND status = 'submitted') as my_attempts
    FROM exams e
    JOIN users u ON e.teacher_id = u.id
    WHERE e.is_active = 1
    ORDER BY e.created_at DESC
  `).all(req.user.id);
  res.json(exams);
});

// بدء امتحان
router.post('/:id/start', authenticateToken, requireStudent, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود أو غير متاح' });

  const submittedAttempts = db.prepare(
    "SELECT COUNT(*) as count FROM exam_attempts WHERE exam_id = ? AND student_id = ? AND status = 'submitted'"
  ).get(exam.id, req.user.id);

  if (!exam.allow_retake && submittedAttempts.count > 0) {
    return res.status(403).json({ error: 'لقد أديت هذا الامتحان مسبقاً ولا يسمح بإعادة المحاولة' });
  }

  const inProgress = db.prepare(
    "SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ? AND status = 'in_progress'"
  ).get(exam.id, req.user.id);

  const questions = db.prepare(
    'SELECT id, question_text, option_a, option_b, option_c, option_d, points FROM questions WHERE exam_id = ?'
  ).all(exam.id);

  if (inProgress) {
    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(inProgress.started_at + 'Z').getTime()) / 1000
    );
    return res.json({
      attempt_id: inProgress.id,
      exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes },
      questions,
      elapsed_seconds: Math.max(0, elapsedSeconds),
      resumed: true
    });
  }

  const result = db.prepare(
    'INSERT INTO exam_attempts (exam_id, student_id) VALUES (?, ?)'
  ).run(exam.id, req.user.id);

  res.json({
    attempt_id: result.lastInsertRowid,
    exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes },
    questions,
    elapsed_seconds: 0,
    resumed: false
  });
});

// تسليم الامتحان
router.post('/:id/submit', authenticateToken, requireStudent, (req, res) => {
  const { attempt_id, answers } = req.body;
  if (!attempt_id || !answers) {
    return res.status(400).json({ error: 'بيانات التسليم غير مكتملة' });
  }

  const attempt = db.prepare(
    "SELECT * FROM exam_attempts WHERE id = ? AND student_id = ? AND status = 'in_progress'"
  ).get(attempt_id, req.user.id);

  if (!attempt) {
    return res.status(404).json({ error: 'المحاولة غير موجودة أو تم تسليمها مسبقاً' });
  }

  const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(attempt.exam_id);

  let score = 0;
  let totalPoints = 0;

  try {
    db.exec('BEGIN');

    const insertAnswer = db.prepare(
      'INSERT INTO student_answers (attempt_id, question_id, selected_answer, is_correct) VALUES (?, ?, ?, ?)'
    );

    for (const q of questions) {
      totalPoints += q.points;
      const sa = answers.find(a => a.question_id === q.id);
      const selected = sa ? sa.selected_answer : null;
      const isCorrect = selected === q.correct_answer ? 1 : 0;
      if (isCorrect) score += q.points;
      insertAnswer.run(attempt_id, q.id, selected, isCorrect);
    }

    db.prepare(
      "UPDATE exam_attempts SET status='submitted', submitted_at=datetime('now'), score=?, total_points=? WHERE id=?"
    ).run(score, totalPoints, attempt_id);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ الإجابات' });
  }

  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
  res.json({
    message: 'تم تسليم الامتحان بنجاح',
    score,
    total_points: totalPoints,
    percentage,
    passed: percentage >= 50
  });
});

// نتائج الطالب
router.get('/my-results/all', authenticateToken, requireStudent, (req, res) => {
  const results = db.prepare(`
    SELECT
      ea.id as attempt_id,
      e.title as exam_title,
      u.name as teacher_name,
      ea.score,
      ea.total_points,
      ea.submitted_at,
      ROUND(CAST(ea.score AS REAL) / NULLIF(ea.total_points, 0) * 100, 1) as percentage
    FROM exam_attempts ea
    JOIN exams e ON ea.exam_id = e.id
    JOIN users u ON e.teacher_id = u.id
    WHERE ea.student_id = ? AND ea.status = 'submitted'
    ORDER BY ea.submitted_at DESC
  `).all(req.user.id);
  res.json(results);
});

module.exports = router;
