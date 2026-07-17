import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'courses.db');
const db = new sqlite3.Database(dbPath);

// Helper function to run queries and return a promise
export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Helper function to fetch all rows
export const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Helper function to fetch a single row
export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const initDb = async () => {
  console.log('Initializing database at:', dbPath);

  // Create Users Table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student'
    )
  `);

  // Create Courses Table
  await run(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      instructor_id INTEGER,
      thumbnail TEXT,
      difficulty TEXT,
      FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Lessons Table
  await run(`
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER,
      title TEXT NOT NULL,
      video_url TEXT NOT NULL,
      duration TEXT,
      sort_order INTEGER,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `);

  // Create Enrollments Table
  await run(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      course_id INTEGER,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, course_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `);

  // Create Progress Table
  await run(`
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      lesson_id INTEGER,
      completed INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, lesson_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    )
  `);

  console.log('Database tables created successfully.');

  // Seed default data if users table is empty
  const userCount = await get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    console.log('Seeding database with default mock data...');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    // Insert Users
    const studentResult = await run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Jane Doe', 'student@example.com', passwordHash, 'student']
    );
    const instructorResult = await run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Professor Smith', 'instructor@example.com', passwordHash, 'instructor']
    );

    const studentId = studentResult.id;
    const instructorId = instructorResult.id;

    // Insert Courses
    const course1 = await run(
      'INSERT INTO courses (title, description, category, instructor_id, thumbnail, difficulty) VALUES (?, ?, ?, ?, ?, ?)',
      [
        'Introduction to Full-Stack Web Development',
        'Learn HTML, CSS, JavaScript, Node.js, Express, and SQLite from scratch. Build real-world full-stack web applications in this comprehensive course.',
        'Development',
        instructorId,
        'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&auto=format&fit=crop&q=60',
        'Beginner'
      ]
    );

    const course2 = await run(
      'INSERT INTO courses (title, description, category, instructor_id, thumbnail, difficulty) VALUES (?, ?, ?, ?, ?, ?)',
      [
        'Advanced JavaScript & Patterns',
        'Master closures, prototypical inheritance, design patterns, asynchronous programming, and clean code in JS.',
        'Development',
        instructorId,
        'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=800&auto=format&fit=crop&q=60',
        'Intermediate'
      ]
    );

    const course3 = await run(
      'INSERT INTO courses (title, description, category, instructor_id, thumbnail, difficulty) VALUES (?, ?, ?, ?, ?, ?)',
      [
        'UI/UX Design Masterclass',
        'Design beautiful user interfaces and create high-fidelity prototypes using Figma, layout principles, and design systems.',
        'Design',
        instructorId,
        'https://images.unsplash.com/photo-1561070791-26c113006238?w=800&auto=format&fit=crop&q=60',
        'Beginner'
      ]
    );

    // Insert Lessons for Course 1
    await run(
      'INSERT INTO lessons (course_id, title, video_url, duration, sort_order) VALUES (?, ?, ?, ?, ?)',
      [
        course1.id,
        '1. Course Overview & Setup',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        '10:15',
        1
      ]
    );
    await run(
      'INSERT INTO lessons (course_id, title, video_url, duration, sort_order) VALUES (?, ?, ?, ?, ?)',
      [
        course1.id,
        '2. HTML Basics & Core Elements',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        '15:45',
        2
      ]
    );
    await run(
      'INSERT INTO lessons (course_id, title, video_url, duration, sort_order) VALUES (?, ?, ?, ?, ?)',
      [
        course1.id,
        '3. CSS Layouts, Grid, and Flexbox',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        '18:20',
        3
      ]
    );
    await run(
      'INSERT INTO lessons (course_id, title, video_url, duration, sort_order) VALUES (?, ?, ?, ?, ?)',
      [
        course1.id,
        '4. JavaScript Dom Manipulation',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        '22:10',
        4
      ]
    );

    // Insert Lessons for Course 2
    await run(
      'INSERT INTO lessons (course_id, title, video_url, duration, sort_order) VALUES (?, ?, ?, ?, ?)',
      [
        course2.id,
        '1. JavaScript Execution Context',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
        '12:30',
        1
      ]
    );
    await run(
      'INSERT INTO lessons (course_id, title, video_url, duration, sort_order) VALUES (?, ?, ?, ?, ?)',
      [
        course2.id,
        '2. Closures & Lexical Scope',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
        '14:50',
        2
      ]
    );

    // Insert Lessons for Course 3
    await run(
      'INSERT INTO lessons (course_id, title, video_url, duration, sort_order) VALUES (?, ?, ?, ?, ?)',
      [
        course3.id,
        '1. Introduction to UI vs UX',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
        '08:45',
        1
      ]
    );

    // Auto-enroll the default student in Course 1 for initial onboarding experience
    await run(
      'INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)',
      [studentId, course1.id]
    );

    console.log('Seeding complete.');
  }
};
