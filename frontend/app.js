// --- GLOBAL APP STATE ---
const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  currentView: 'explore',
  courses: [],
  enrolledCourses: [],
  instructorCourses: [],
  activeCourse: null,
  activeLesson: null,
  activeTab: 'tab-overview'
};

const API_BASE = '/api';

// --- API HELPER FUNCTION ---
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

// --- VIEW ROUTER ---
function showView(viewId) {
  state.currentView = viewId;
  
  // Hide all view sections
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.add('hidden');
  });

  // Show selected view
  const targetSection = document.getElementById(viewId);
  if (targetSection) {
    targetSection.classList.remove('hidden');
  }

  // Update navigation link states
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });

  if (viewId === 'view-explore') {
    document.getElementById('link-explore').classList.add('active');
  } else if (viewId === 'view-student-dashboard' || viewId === 'view-instructor-dashboard') {
    document.getElementById('link-dashboard').classList.add('active');
  }

  // Execute view-specific loaders
  if (viewId === 'view-explore') {
    loadExploreCourses();
  } else if (viewId === 'view-student-dashboard') {
    loadStudentDashboard();
  } else if (viewId === 'view-instructor-dashboard') {
    loadInstructorDashboard();
  }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Remove toast after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.9)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- AUTHENTICATION ACTIONS ---
async function login(email, password) {
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    showToast(`Welcome back, ${state.user.name}!`, 'success');
    closeAuthModal();
    updateAuthUI();
    
    // Redirect to dashboard
    if (state.user.role === 'instructor') {
      showView('view-instructor-dashboard');
    } else {
      showView('view-student-dashboard');
    }
  } catch (error) {
    const errDiv = document.getElementById('login-error');
    errDiv.textContent = error.message;
    errDiv.classList.remove('hidden');
    showToast(error.message, 'error');
  }
}

async function register(name, email, password, role) {
  try {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    showToast(`Account created successfully! Welcome, ${state.user.name}!`, 'success');
    closeAuthModal();
    updateAuthUI();

    if (state.user.role === 'instructor') {
      showView('view-instructor-dashboard');
    } else {
      showView('view-student-dashboard');
    }
  } catch (error) {
    const errDiv = document.getElementById('register-error');
    errDiv.textContent = error.message;
    errDiv.classList.remove('hidden');
    showToast(error.message, 'error');
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  showToast('Logged out successfully', 'info');
  updateAuthUI();
  showView('view-explore');
}

// Verify stored token on boot
async function verifyAuth() {
  if (state.token) {
    try {
      const data = await apiFetch('/auth/me');
      state.user = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (e) {
      console.warn('Session expired or invalid token');
      state.token = null;
      state.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }
  updateAuthUI();
}

function updateAuthUI() {
  const authSection = document.getElementById('nav-auth-section');
  const profileSection = document.getElementById('nav-profile-section');
  const dashboardLink = document.getElementById('link-dashboard');

  if (state.user) {
    authSection.classList.add('hidden');
    profileSection.classList.remove('hidden');
    dashboardLink.classList.remove('hidden');

    document.getElementById('user-display-name').textContent = state.user.name;
    document.getElementById('user-display-role').textContent = state.user.role;

    // Adjust dashboard links
    dashboardLink.onclick = (e) => {
      e.preventDefault();
      if (state.user.role === 'instructor') {
        showView('view-instructor-dashboard');
      } else {
        showView('view-student-dashboard');
      }
    };
  } else {
    authSection.classList.remove('hidden');
    profileSection.classList.add('hidden');
    dashboardLink.classList.add('hidden');
  }
}

// --- EXPLORE VIEW ACTIONS ---
async function loadExploreCourses() {
  const grid = document.getElementById('courses-grid');
  grid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';

  try {
    const searchVal = document.getElementById('course-search').value;
    const activeTab = document.querySelector('.category-tab.active');
    const category = activeTab ? activeTab.dataset.category : 'all';

    let endpoint = '/courses';
    const params = [];
    if (searchVal) params.push(`search=${encodeURIComponent(searchVal)}`);
    if (category && category !== 'all') params.push(`category=${encodeURIComponent(category)}`);

    if (params.length > 0) {
      endpoint += `?${params.join('&')}`;
    }

    const courses = await apiFetch(endpoint);
    state.courses = courses;

    if (courses.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 16px; color: var(--primary-color);"></i>
          <h3>No Courses Found</h3>
          <p>Try searching for another topic or clear the filter.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = courses.map(course => `
      <div class="course-card" onclick="viewCourseDetails(${course.id})">
        <div class="course-thumb">
          <img src="${course.thumbnail}" alt="${course.title}">
          <span class="course-tag">${course.category}</span>
          <span class="course-difficulty-tag">${course.difficulty}</span>
        </div>
        <div class="course-info">
          <h3 class="course-card-title">${course.title}</h3>
          <p class="course-card-desc">${course.description}</p>
          <div class="course-meta">
            <div class="course-instructor">
              <i class="fa-solid fa-chalkboard-user"></i>
              <span>${course.instructor_name}</span>
            </div>
            <div class="course-lessons">
              <i class="fa-solid fa-circle-play"></i>
              <span>${course.lesson_count} lessons</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--danger-color); text-align: center;">Error loading courses: ${error.message}</div>`;
  }
}

// --- COURSE DETAILS ACTIONS ---
async function viewCourseDetails(courseId) {
  showView('view-course-details');
  const contentDiv = document.getElementById('course-detail-content');
  contentDiv.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Loading details...</div>';

  try {
    const data = await apiFetch(`/courses/${courseId}`);
    state.activeCourse = data;

    const { course, lessons, isEnrolled } = data;

    let enrollButtonHTML = '';
    if (!state.user) {
      enrollButtonHTML = `<button class="btn btn-primary btn-block" onclick="openAuthModal('login')">Sign In to Enroll</button>`;
    } else if (state.user.role === 'student') {
      if (isEnrolled) {
        enrollButtonHTML = `<button class="btn btn-primary btn-block" onclick="startCoursePlayer(${course.id})">Resume Course</button>`;
      } else {
        enrollButtonHTML = `<button class="btn btn-primary btn-block" onclick="enrollInCourse(${course.id})">Enroll Now</button>`;
      }
    } else {
      enrollButtonHTML = `<button class="btn btn-secondary btn-block" disabled>Instructors cannot enroll</button>`;
    }

    contentDiv.innerHTML = `
      <div class="course-detail-main">
        <span class="detail-category">${course.category}</span>
        <h1 class="detail-title">${course.title}</h1>
        <div class="detail-meta">
          <div class="detail-meta-item">
            <i class="fa-solid fa-chalkboard-user"></i>
            <span>Instructed by <strong>${course.instructor_name}</strong></span>
          </div>
          <div class="detail-meta-item">
            <i class="fa-solid fa-chart-simple"></i>
            <span>${course.difficulty} Level</span>
          </div>
          <div class="detail-meta-item">
            <i class="fa-solid fa-circle-play"></i>
            <span>${lessons.length} Lessons</span>
          </div>
        </div>
        <div class="detail-description">
          <h3>About this course</h3>
          <p>${course.description}</p>
        </div>

        <div class="curriculum-section">
          <h3>Syllabus / Curriculum</h3>
          <ul class="curriculum-list">
            ${lessons.map(lesson => `
              <li class="curriculum-item">
                <div class="curriculum-item-left">
                  <i class="fa-regular fa-circle-play"></i>
                  <span>${lesson.title}</span>
                </div>
                <span class="curriculum-duration">${lesson.duration}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
      <div class="course-detail-sidebar">
        <img class="detail-sidebar-img" src="${course.thumbnail}" alt="${course.title}">
        <div class="price-box">
          <div class="price-title">Access Type</div>
          <div class="price-value">FREE <span>$199</span></div>
        </div>
        ${enrollButtonHTML}
      </div>
    `;
  } catch (error) {
    contentDiv.innerHTML = `<div style="grid-column: 1/-1; color: var(--danger-color); text-align: center;">Error loading course detail: ${error.message}</div>`;
  }
}

async function enrollInCourse(courseId) {
  try {
    await apiFetch(`/courses/${courseId}/enroll`, { method: 'POST' });
    showToast('Enrolled in course successfully!', 'success');
    startCoursePlayer(courseId);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// --- STUDENT DASHBOARD ---
async function loadStudentDashboard() {
  const welcomeName = document.getElementById('student-welcome-name');
  welcomeName.textContent = state.user ? state.user.name : 'Learner';

  const grid = document.getElementById('student-courses-grid');
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Fetching your courses...</div>';

  try {
    // Load Stats
    const stats = await apiFetch('/dashboard/stats');
    document.getElementById('stat-enrolled-count').textContent = stats.enrolledCourses;
    document.getElementById('stat-completed-count').textContent = stats.completedLessons;

    // Load Courses
    const enrolled = await apiFetch('/my-courses');
    state.enrolledCourses = enrolled;

    if (enrolled.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px; background: var(--panel-bg); border-radius: 20px; border: 1px solid var(--panel-border);">
          <i class="fa-solid fa-graduation-cap" style="font-size: 3rem; margin-bottom: 16px; color: var(--secondary-color);"></i>
          <h3>No Enrollments Yet</h3>
          <p style="color: var(--text-muted); margin-bottom: 20px;">Explore and enroll in courses to start your learning path.</p>
          <button class="btn btn-primary" onclick="showView('view-explore')">Find Courses</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = enrolled.map(course => {
      const total = course.lesson_count;
      const completed = course.completed_lessons_count || 0;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      return `
        <div class="course-card">
          <div class="course-thumb">
            <img src="${course.thumbnail}" alt="${course.title}">
            <span class="course-tag">${course.category}</span>
          </div>
          <div class="course-info">
            <h3 class="course-card-title">${course.title}</h3>
            <div class="course-meta">
              <div class="course-instructor">
                <i class="fa-solid fa-chalkboard-user"></i>
                <span>${course.instructor_name}</span>
              </div>
            </div>
            
            <div class="card-progress-section">
              <div class="card-progress-info">
                <span>Progress</span>
                <span>${pct}% (${completed}/${total} lessons)</span>
              </div>
              <div class="progress-bar-outer">
                <div class="progress-bar-inner" style="width: ${pct}%;"></div>
              </div>
            </div>

            <div class="card-action-bar">
              <button class="btn btn-primary btn-block" onclick="startCoursePlayer(${course.id})">
                <i class="fa-solid fa-play"></i> ${pct === 0 ? 'Start Course' : 'Resume Learning'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--danger-color); text-align: center;">Error loading dashboard data: ${error.message}</div>`;
  }
}

// --- INSTRUCTOR DASHBOARD ---
async function loadInstructorDashboard() {
  const grid = document.getElementById('instructor-courses-grid');
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Fetching your courses...</div>';

  try {
    // Load Stats
    const stats = await apiFetch('/dashboard/stats');
    document.getElementById('stat-created-courses-count').textContent = stats.createdCourses;
    document.getElementById('stat-total-students-count').textContent = stats.totalStudents;

    // Load Courses
    const courses = await apiFetch('/my-courses');
    state.instructorCourses = courses;

    if (courses.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px; background: var(--panel-bg); border-radius: 20px; border: 1px solid var(--panel-border);">
          <i class="fa-solid fa-chalkboard-user" style="font-size: 3rem; margin-bottom: 16px; color: var(--primary-color);"></i>
          <h3>No Courses Published</h3>
          <p style="color: var(--text-muted); margin-bottom: 20px;">Get started by creating your first online course curriculum.</p>
          <button class="btn btn-primary" onclick="openCreateCourseModal()"><i class="fa-solid fa-plus"></i> Create A Course</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = courses.map(course => `
      <div class="course-card">
        <div class="course-thumb">
          <img src="${course.thumbnail}" alt="${course.title}">
          <span class="course-tag">${course.category}</span>
        </div>
        <div class="course-info">
          <h3 class="course-card-title">${course.title}</h3>
          
          <div class="course-meta" style="margin-top: auto; padding-top: 16px; border-top: 1px solid var(--panel-border);">
            <div class="course-instructor">
              <i class="fa-solid fa-users"></i>
              <span>${course.student_count || 0} students</span>
            </div>
            <div class="course-lessons">
              <i class="fa-solid fa-circle-play"></i>
              <span>${course.lesson_count || 0} lessons</span>
            </div>
          </div>

          <div class="card-action-bar" style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" style="flex: 1;" onclick="openAddLessonModal(${course.id}, '${course.title.replace(/'/g, "\\'")}')">
              <i class="fa-solid fa-plus"></i> Add Lesson
            </button>
            <button class="btn btn-primary" style="flex: 1;" onclick="viewCourseDetails(${course.id})">
              <i class="fa-solid fa-eye"></i> View Detail
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--danger-color); text-align: center;">Error loading courses: ${error.message}</div>`;
  }
}

// --- INTERACTIVE COURSE PLAYER ---
async function startCoursePlayer(courseId) {
  showView('view-course-player');
  
  try {
    const data = await apiFetch(`/courses/${courseId}`);
    state.activeCourse = data;

    const { course, lessons, progress } = data;

    document.getElementById('player-course-title').textContent = course.title;
    document.getElementById('player-course-description').textContent = course.description;

    if (lessons.length === 0) {
      document.getElementById('player-lessons-list').innerHTML = `<div style="padding: 24px; color: var(--text-muted);">No lessons uploaded yet.</div>`;
      document.getElementById('player-lesson-title').textContent = "No Lessons";
      document.getElementById('course-video').removeAttribute('src');
      return;
    }

    renderPlayerSyllabus(lessons, progress);
    
    // Start with the first lesson or the first incomplete lesson
    const completedIds = progress.filter(p => p.completed === 1).map(p => p.lesson_id);
    const firstIncomplete = lessons.find(l => !completedIds.includes(l.id));
    
    playLesson(firstIncomplete || lessons[0]);
  } catch (error) {
    showToast(`Error initializing player: ${error.message}`, 'error');
  }
}

function renderPlayerSyllabus(lessons, progress) {
  const sidebar = document.getElementById('player-lessons-list');
  const completedMap = {};
  progress.forEach(p => {
    completedMap[p.lesson_id] = p.completed === 1;
  });

  let completedCount = 0;
  lessons.forEach(l => {
    if (completedMap[l.id]) completedCount++;
  });

  // Update Syllabus Header Progress Bar
  const pct = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;
  document.getElementById('player-progress-percentage').textContent = `${pct}%`;
  document.getElementById('player-progress-bar').style.width = `${pct}%`;

  sidebar.innerHTML = lessons.map(lesson => {
    const isCompleted = !!completedMap[lesson.id];
    const isActive = state.activeLesson && state.activeLesson.id === lesson.id;

    return `
      <div class="sidebar-lesson-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}" 
           onclick="selectLesson(${lesson.id})">
        <div class="lesson-check-icon">
          <i class="${isCompleted ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i>
        </div>
        <div class="sidebar-lesson-info">
          <div class="sidebar-lesson-title">${lesson.title}</div>
          <div class="sidebar-lesson-duration"><i class="fa-regular fa-clock"></i> ${lesson.duration}</div>
        </div>
      </div>
    `;
  }).join('');
}

function playLesson(lesson) {
  state.activeLesson = lesson;
  
  // Highlight active sidebar item
  document.querySelectorAll('.sidebar-lesson-item').forEach((item, index) => {
    const isCurrent = state.activeCourse.lessons[index].id === lesson.id;
    if (isCurrent) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  document.getElementById('player-lesson-title').textContent = lesson.title;
  document.getElementById('player-lesson-duration').innerHTML = `<i class="fa-regular fa-clock"></i> ${lesson.duration}`;

  // Check completion state
  const progressList = state.activeCourse.progress;
  const isCompleted = progressList.some(p => p.lesson_id === lesson.id && p.completed === 1);
  updateCompleteButtonUI(isCompleted);

  // Set video source
  const video = document.getElementById('course-video');
  video.src = lesson.video_url;
  video.load();
  video.play().catch(err => console.log("Auto-play blocked by browser. Click play to start."));
}

function selectLesson(lessonId) {
  const lesson = state.activeCourse.lessons.find(l => l.id === lessonId);
  if (lesson) playLesson(lesson);
}

function updateCompleteButtonUI(completed) {
  const btn = document.getElementById('btn-toggle-complete');
  const txt = document.getElementById('toggle-complete-text');
  
  if (completed) {
    btn.className = "btn btn-secondary";
    btn.style.color = "var(--success-color)";
    btn.style.borderColor = "var(--success-color)";
    txt.textContent = "Completed";
    btn.querySelector('i').className = "fa-solid fa-circle-check";
  } else {
    btn.className = "btn btn-secondary";
    btn.style.color = "var(--text-main)";
    btn.style.borderColor = "var(--panel-border)";
    txt.textContent = "Mark as Completed";
    btn.querySelector('i').className = "fa-regular fa-circle-check";
  }
}

async function toggleLessonCompletion() {
  if (!state.activeLesson) return;

  const lessonId = state.activeLesson.id;
  const progressList = state.activeCourse.progress;
  const wasCompleted = progressList.some(p => p.lesson_id === lessonId && p.completed === 1);
  const nowCompleted = !wasCompleted;

  try {
    await apiFetch(`/lessons/${lessonId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ completed: nowCompleted })
    });

    // Update local state
    if (nowCompleted) {
      if (!progressList.some(p => p.lesson_id === lessonId)) {
        progressList.push({ lesson_id: lessonId, completed: 1 });
      } else {
        const item = progressList.find(p => p.lesson_id === lessonId);
        item.completed = 1;
      }
      showToast('Lesson marked as completed!', 'success');
    } else {
      const item = progressList.find(p => p.lesson_id === lessonId);
      if (item) item.completed = 0;
      showToast('Lesson marked as incomplete.', 'info');
    }

    updateCompleteButtonUI(nowCompleted);
    renderPlayerSyllabus(state.activeCourse.lessons, progressList);
  } catch (error) {
    showToast(`Error updating completion: ${error.message}`, 'error');
  }
}

// --- CREATOR FORM ACTIONS ---
async function handleCreateCourse(e) {
  e.preventDefault();
  const title = document.getElementById('course-title').value;
  const category = document.getElementById('course-category').value;
  const difficulty = document.getElementById('course-difficulty').value;
  const thumbnail = document.getElementById('course-thumbnail').value;
  const description = document.getElementById('course-description').value;

  try {
    await apiFetch('/courses', {
      method: 'POST',
      body: JSON.stringify({ title, description, category, thumbnail, difficulty })
    });

    showToast('Course created and published!', 'success');
    closeCreateCourseModal();
    loadInstructorDashboard();
  } catch (error) {
    const errDiv = document.getElementById('create-course-error');
    errDiv.textContent = error.message;
    errDiv.classList.remove('hidden');
    showToast(error.message, 'error');
  }
}

async function handleAddLesson(e) {
  e.preventDefault();
  const courseId = document.getElementById('add-lesson-course-id').value;
  const title = document.getElementById('lesson-title').value;
  const video_url = document.getElementById('lesson-video-url').value;
  const duration = document.getElementById('lesson-duration').value;

  try {
    await apiFetch(`/courses/${courseId}/lessons`, {
      method: 'POST',
      body: JSON.stringify({ title, video_url, duration })
    });

    showToast('Lesson added successfully!', 'success');
    closeAddLessonModal();
    loadInstructorDashboard();
  } catch (error) {
    const errDiv = document.getElementById('add-lesson-error');
    errDiv.textContent = error.message;
    errDiv.classList.remove('hidden');
    showToast(error.message, 'error');
  }
}

// --- MODAL TRIGGERS & BINDINGS ---
function openAuthModal(defaultTab = 'login') {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('show');
  
  if (defaultTab === 'login') {
    switchAuthTab('login');
  } else {
    switchAuthTab('register');
  }
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('show');
  document.getElementById('form-login').reset();
  document.getElementById('form-register').reset();
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('register-error').classList.add('hidden');
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tab-login-trigger');
  const tabRegister = document.getElementById('tab-register-trigger');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  } else {
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
    formLogin.classList.add('hidden');
    formRegister.classList.remove('hidden');
  }
}

function openCreateCourseModal() {
  document.getElementById('create-course-modal').classList.add('show');
}

function closeCreateCourseModal() {
  document.getElementById('create-course-modal').classList.remove('show');
  document.getElementById('form-create-course').reset();
  document.getElementById('create-course-error').classList.add('hidden');
}

function openAddLessonModal(courseId, courseName) {
  document.getElementById('add-lesson-course-id').value = courseId;
  document.getElementById('add-lesson-course-name').textContent = courseName;
  document.getElementById('add-lesson-modal').classList.add('show');
}

// Make globally accessible for HTML onclick handlers
window.openAddLessonModal = openAddLessonModal;
window.startCoursePlayer = startCoursePlayer;
window.enrollInCourse = enrollInCourse;
window.viewCourseDetails = viewCourseDetails;
window.selectLesson = selectLesson;

function closeAddLessonModal() {
  document.getElementById('add-lesson-modal').classList.remove('show');
  document.getElementById('form-add-lesson').reset();
  document.getElementById('add-lesson-error').classList.add('hidden');
}

// --- DOM EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth status
  await verifyAuth();

  // Load initial explore page
  loadExploreCourses();

  // Logo Navigation click
  document.getElementById('nav-logo').addEventListener('click', (e) => {
    e.preventDefault();
    showView('view-explore');
  });

  // Nav Explore Click
  document.getElementById('link-explore').addEventListener('click', (e) => {
    e.preventDefault();
    showView('view-explore');
  });

  // Auth Button triggers
  document.getElementById('btn-show-login').addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btn-show-register').addEventListener('click', () => openAuthModal('register'));
  document.getElementById('btn-close-auth').addEventListener('click', closeAuthModal);

  // Auth Tab Switch triggers
  document.getElementById('tab-login-trigger').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tab-register-trigger').addEventListener('click', () => switchAuthTab('register'));

  // Auth Submit Handlers
  document.getElementById('form-login').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    login(email, pass);
  });

  document.getElementById('form-register').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const pass = document.getElementById('register-password').value;
    const role = document.querySelector('input[name="register-role"]:checked').value;
    register(name, email, pass, role);
  });

  // Profile Dropdown Toggle
  const profileTrigger = document.getElementById('profile-trigger');
  const profileDropdown = document.getElementById('profile-dropdown-menu');
  if (profileTrigger) {
    profileTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('show');
    });
  }

  document.addEventListener('click', () => {
    if (profileDropdown) profileDropdown.classList.remove('show');
  });

  document.getElementById('btn-logout').addEventListener('click', logout);

  // Search & Filtering Bindings
  document.getElementById('btn-search').addEventListener('click', loadExploreCourses);
  document.getElementById('course-search').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') loadExploreCourses();
  });

  document.getElementById('category-tabs').addEventListener('click', (e) => {
    if (e.target.classList.contains('category-tab')) {
      document.querySelectorAll('.category-tab').forEach(tab => tab.classList.remove('active'));
      e.target.classList.add('active');
      loadExploreCourses();
    }
  });

  // Navigation Back buttons
  document.getElementById('btn-back-to-explore').addEventListener('click', () => {
    showView('view-explore');
  });

  document.getElementById('btn-back-to-dashboard').addEventListener('click', () => {
    // Stop video
    document.getElementById('course-video').pause();
    if (state.user && state.user.role === 'instructor') {
      showView('view-instructor-dashboard');
    } else {
      showView('view-student-dashboard');
    }
  });

  // Course Player Toggle Complete
  document.getElementById('btn-toggle-complete').addEventListener('click', toggleLessonCompletion);

  // Course Player Video auto-mark complete
  const video = document.getElementById('course-video');
  video.addEventListener('ended', async () => {
    // When video completes, check if not already marked completed, if so mark it completed automatically
    if (state.activeLesson) {
      const progressList = state.activeCourse.progress;
      const isCompleted = progressList.some(p => p.lesson_id === state.activeLesson.id && p.completed === 1);
      if (!isCompleted) {
        await toggleLessonCompletion();
      }
    }
  });

  // Video player tabs toggle
  document.querySelectorAll('.tab-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-trigger').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      e.target.classList.add('active');
      const tabId = e.target.dataset.tab;
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Creator Modal controls
  document.getElementById('btn-show-create-course').addEventListener('click', openCreateCourseModal);
  document.getElementById('btn-close-create-course').addEventListener('click', closeCreateCourseModal);
  document.getElementById('form-create-course').addEventListener('submit', handleCreateCourse);

  document.getElementById('btn-close-add-lesson').addEventListener('click', closeAddLessonModal);
  document.getElementById('form-add-lesson').addEventListener('submit', handleAddLesson);
});
