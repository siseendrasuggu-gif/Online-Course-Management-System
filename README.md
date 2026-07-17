# Aether Academy | Online Course Management System

A premium, modern, production-ready full-stack online learning management system. Built with an Express.js backend API, an SQLite database, and a custom glassmorphic front-end UI.

## Features

- **JWT Authentication**: Secure user registration and login with student/instructor roles.
- **Glassmorphic UI**: Vibrant, responsive front-end dashboard designed in Vanilla CSS (following dark-mode aesthetic).
- **Interactive Course Player**: Single-page player featuring an HTML5 video stream, dynamic curriculum navigation, progress tracking, and lecture notes resources.
- **Student Dashboard**: Live tracking of course enrollments, milestone progression metrics, and course completions.
- **Instructor Workspace**: Interface for instructors to publish courses, upload curriculum lessons, and monitor student counts.
- **Self-contained SQLite Database**: Quick and lightweight SQLite database setup populated automatically with rich mock data.

## Project Structure

```
Online-Course-Management-System/
├── backend/
│   ├── db.js          # SQLite database schema, helpers, and seed data
│   ├── server.js      # Express application entry point & API endpoints
│   ├── package.json   # Node.js backend dependencies
│   └── .env           # Environment configuration (PORT, JWT_SECRET)
├── frontend/
│   ├── index.html     # SPA structure with dashboards, course details, player, and forms
│   ├── styles.css     # Obsidian dark themes, layout grid, transitions, and alerts
│   └── app.js         # Single-page client router, AJAX requests, and interactive player
└── .gitignore         # Excluded files list
```

## Quick Start Guide

### Prerequisites
- Node.js installed on your machine.

### Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```

### Running the App

1. Run the start script in the backend directory:
   ```bash
   npm start
   ```
2. Open your web browser and navigate to:
   ```
   http://localhost:5000
   ```

### Default Seed Credentials

For immediate testing, the database is pre-seeded with two accounts:

- **Student Account**:
  - Email: `student@example.com`
  - Password: `password123`
- **Instructor Account**:
  - Email: `instructor@example.com`
  - Password: `password123`
