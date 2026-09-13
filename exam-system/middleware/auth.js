const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'exam_system_super_secret_key_2024';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'جلسة منتهية، يرجى تسجيل الدخول مجدداً' });
  }
}

function requireTeacher(req, res, next) {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'هذا الإجراء مخصص للمدرسين فقط' });
  }
  next();
}

function requireStudent(req, res, next) {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'هذا الإجراء مخصص للطلاب فقط' });
  }
  next();
}

module.exports = { authenticateToken, requireTeacher, requireStudent };
