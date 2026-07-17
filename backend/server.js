import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, run, get, all } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5050;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_dev';

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Optional Authentication Middleware (for routes that behave differently for logged-in users)
const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) {
      req.user = user;
    }
    next();
  });
};

// --- AUTHENTICATION ENDPOINTS ---

// Register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please enter all fields' });
  }

  try {
    // Check if user already exists
    const existingUser = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userRole = role === 'instructor' ? 'instructor' : 'student';

    const result = await run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, userRole]
    );

    const token = jwt.sign({ id: result.id, role: userRole }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: result.id,
        name,
        email,
        role: userRole
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter all fields' });
  }

  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await get('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

// --- COURSE ENDPOINTS ---

// Get all courses (with optional filters)
app.get('/api/courses', async (req, res) => {
  const { search, category } = req.query;

  try {
    let query = `
      SELECT courses.*, users.name as instructor_name, 
      (SELECT COUNT(*) FROM lessons WHERE lessons.course_id = courses.id) as lesson_count 
      FROM courses 
      JOIN users ON courses.instructor_id = users.id
    `;
    const params = [];

    if (search || category) {
      query += ' WHERE';
      const filters = [];
      if (search) {
        filters.push(' (courses.title LIKE ? OR courses.description LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }
      if (category) {
        filters.push(' courses.category = ?');
        params.push(category);
      }
      query += filters.join(' AND');
    }

    const courses = await all(query, params);
    res.json(courses);
  } catch (error) {
    console.error('Fetch courses error:', error);
    res.status(500).json({ error: 'Server error fetching courses' });
  }
});

// Get detailed course (lessons and enrollment status)
app.get('/api/courses/:id', optionalAuthenticate, async (req, res) => {
  const courseId = req.params.id;

  try {
    const course = await get(
      `SELECT courses.*, users.name as instructor_name 
       FROM courses 
       JOIN users ON courses.instructor_id = users.id 
       WHERE courses.id = ?`,
      [courseId]
    );

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const lessons = await all(
      'SELECT id, title, video_url, duration, sort_order FROM lessons WHERE course_id = ? ORDER BY sort_order ASC',
      [courseId]
    );

    let isEnrolled = false;
    let progressList = [];

    if (req.user) {
      const enrollment = await get(
        'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?',
        [req.user.id, courseId]
      );
      isEnrolled = !!enrollment;

      if (isEnrolled) {
        progressList = await all(
          `SELECT progress.lesson_id, progress.completed 
           FROM progress 
           JOIN lessons ON progress.lesson_id = lessons.id 
           WHERE lessons.course_id = ? AND progress.student_id = ?`,
          [courseId, req.user.id]
        );
      }
    }

    res.json({
      course,
      lessons,
      isEnrolled,
      progress: progressList
    });
  } catch (error) {
    console.error('Fetch course details error:', error);
    res.status(500).json({ error: 'Server error fetching course details' });
  }
});

// Enroll in a course (Students only)
app.post('/api/courses/:id/enroll', authenticateToken, async (req, res) => {
  const courseId = req.params.id;

  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can enroll in courses' });
  }

  try {
    const course = await get('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if already enrolled
    const existingEnrollment = await get(
      'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?',
      [req.user.id, courseId]
    );

    if (existingEnrollment) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    await run('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)', [
      req.user.id,
      courseId
    ]);

    res.status(201).json({ message: 'Enrolled successfully' });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ error: 'Server error during enrollment' });
  }
});

// Get user-specific courses (Enrolled for students, Created for instructors)
app.get('/api/my-courses', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const courses = await all(
        `SELECT courses.*, users.name as instructor_name, 
         (SELECT COUNT(*) FROM lessons WHERE lessons.course_id = courses.id) as lesson_count,
         (SELECT COUNT(*) FROM progress JOIN lessons ON progress.lesson_id = lessons.id 
          WHERE lessons.course_id = courses.id AND progress.student_id = ? AND progress.completed = 1) as completed_lessons_count
         FROM enrollments 
         JOIN courses ON enrollments.course_id = courses.id 
         JOIN users ON courses.instructor_id = users.id 
         WHERE enrollments.student_id = ?`,
        [req.user.id, req.user.id]
      );
      res.json(courses);
    } else if (req.user.role === 'instructor') {
      const courses = await all(
        `SELECT courses.*, 
         (SELECT COUNT(*) FROM lessons WHERE lessons.course_id = courses.id) as lesson_count,
         (SELECT COUNT(*) FROM enrollments WHERE enrollments.course_id = courses.id) as student_count
         FROM courses 
         WHERE courses.instructor_id = ?`,
        [req.user.id]
      );
      res.json(courses);
    }
  } catch (error) {
    console.error('Fetch my-courses error:', error);
    res.status(500).json({ error: 'Server error fetching your courses' });
  }
});

// Create a Course (Instructors only)
app.post('/api/courses', authenticateToken, async (req, res) => {
  const { title, description, category, thumbnail, difficulty } = req.body;

  if (req.user.role !== 'instructor') {
    return res.status(403).json({ error: 'Only instructors can create courses' });
  }

  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Title, description, and category are required' });
  }

  const thumbUrl = thumbnail || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60';
  const diffLevel = difficulty || 'Beginner';

  try {
    const result = await run(
      'INSERT INTO courses (title, description, category, instructor_id, thumbnail, difficulty) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, category, req.user.id, thumbUrl, diffLevel]
    );

    res.status(201).json({
      message: 'Course created successfully',
      courseId: result.id
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Server error creating course' });
  }
});

// Add lesson to a Course (Instructors only & creator of course)
app.post('/api/courses/:id/lessons', authenticateToken, async (req, res) => {
  const courseId = req.params.id;
  const { title, video_url, duration } = req.body;

  if (req.user.role !== 'instructor') {
    return res.status(403).json({ error: 'Only instructors can add lessons' });
  }

  if (!title || !video_url || !duration) {
    return res.status(400).json({ error: 'Title, video URL, and duration are required' });
  }

  try {
    // Verify course belongs to this instructor
    const course = await get('SELECT * FROM courses WHERE id = ? AND instructor_id = ?', [
      courseId,
      req.user.id
    ]);

    if (!course) {
      return res.status(403).json({ error: 'You do not have permission to edit this course' });
    }

    // Get current lesson count to determine sort order
    const lessonCount = await get('SELECT COUNT(*) as count FROM lessons WHERE course_id = ?', [
      courseId
    ]);
    const sortOrder = lessonCount.count + 1;

    const result = await run(
      'INSERT INTO lessons (course_id, title, video_url, duration, sort_order) VALUES (?, ?, ?, ?, ?)',
      [courseId, title, video_url, duration, sortOrder]
    );

    res.status(201).json({
      message: 'Lesson added successfully',
      lessonId: result.id
    });
  } catch (error) {
    console.error('Add lesson error:', error);
    res.status(500).json({ error: 'Server error adding lesson' });
  }
});

// --- PROGRESS ENDPOINTS ---

// Mark lesson as complete / incomplete
app.post('/api/lessons/:id/complete', authenticateToken, async (req, res) => {
  const lessonId = req.params.id;
  const { completed } = req.body; // Expects true or false

  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can track progress' });
  }

  const isCompleted = completed ? 1 : 0;

  try {
    // Verify enrollment
    const lesson = await get('SELECT course_id FROM lessons WHERE id = ?', [lessonId]);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const enrollment = await get(
      'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?',
      [req.user.id, lesson.course_id]
    );

    if (!enrollment) {
      return res.status(403).json({ error: 'You must be enrolled in this course to mark progress' });
    }

    await run(
      `INSERT INTO progress (student_id, lesson_id, completed, updated_at) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
       ON CONFLICT(student_id, lesson_id) 
       DO UPDATE SET completed = excluded.completed, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, lessonId, isCompleted]
    );

    res.json({ message: 'Progress updated successfully', completed: isCompleted === 1 });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Server error updating progress' });
  }
});

// --- STATS / DASHBOARD ---
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const enrollmentStat = await get(
        'SELECT COUNT(*) as count FROM enrollments WHERE student_id = ?',
        [req.user.id]
      );
      const completedStat = await get(
        'SELECT COUNT(*) as count FROM progress WHERE student_id = ? AND completed = 1',
        [req.user.id]
      );

      res.json({
        enrolledCourses: enrollmentStat.count,
        completedLessons: completedStat.count
      });
    } else if (req.user.role === 'instructor') {
      const coursesStat = await get(
        'SELECT COUNT(*) as count FROM courses WHERE instructor_id = ?',
        [req.user.id]
      );
      const studentStat = await get(
        `SELECT COUNT(DISTINCT enrollments.student_id) as count 
         FROM enrollments 
         JOIN courses ON enrollments.course_id = courses.id 
         WHERE courses.instructor_id = ?`,
        [req.user.id]
      );

      res.json({
        createdCourses: coursesStat.count,
        totalStudents: studentStat.count
      });
    }
  } catch (error) {
    console.error('Fetch stats error:', error);
    res.status(500).json({ error: 'Server error fetching statistics' });
  }
});

// Handle React/Vanilla routing by serving index.html for all non-api fallback paths
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Database Init and Server Start
const startServer = async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
