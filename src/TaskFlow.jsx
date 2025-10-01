import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query } from 'firebase/firestore';

// --- Utility Hooks and Components ---

// Hook to securely get Firebase/Auth context variables
const useFirebaseContext = () => {
  // NOTE: In a standard VS Code setup, you would load these variables from 
  // a .env file (e.g., VITE_FIREBASE_CONFIG, VITE_AUTH_TOKEN).
  // Since this code is designed for the Canvas environment, we keep the original structure.
  const firebaseConfig = useMemo(() => {
    try {
      // In a VS Code app, you would replace this block with process.env.VITE_FIREBASE_CONFIG
      return JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
    } catch (e) {
      console.error("Failed to parse firebase config:", e);
      return {};
    }
  }, []);
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  // FIX: Sanitize __app_id to prevent it from containing path separators (/)
  // The __app_id often comes with a structure like "c_ID/doc_ID" which breaks Firestore paths.
  // We replace all slashes with underscores to ensure it counts as a single segment.
  const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-taskflow-app';
  const appId = rawAppId.replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '-');


  return { firebaseConfig, initialAuthToken, appId };
};

// Custom Hook for Firebase Initialization and Authentication
const useAuthAndFirestore = () => {
  const { firebaseConfig, initialAuthToken, appId } = useFirebaseContext();
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (!firebaseConfig || !Object.keys(firebaseConfig).length) {
      console.warn("Firebase config is missing or empty. Persistence will not work.");
      setIsAuthReady(true);
      return;
    }

    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    const authService = getAuth(app);
    setDb(firestore);
    setAuth(authService);

    const unsubscribe = onAuthStateChanged(authService, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(authService, initialAuthToken);
          } else {
            const anonUser = await signInAnonymously(authService);
            setUserId(anonUser.user.uid);
          }
        } catch (error) {
          console.error("Authentication failed:", error);
          // Fallback to anonymous state if sign-in fails
          setUserId(crypto.randomUUID());
        }
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, [firebaseConfig, initialAuthToken]);

  const getTasksCollectionRef = useCallback(() => {
    if (db && userId) {
      // Using Private data structure: /artifacts/{appId}/users/{userId}/tasks
      // appId is now sanitized to prevent multiple segments, fixing the invalid path error.
      return collection(db, 'artifacts', appId, 'users', userId, 'tasks');
    }
    return null;
  }, [db, userId, appId]);

  return { db, userId, isAuthReady, getTasksCollectionRef, auth };
};


// Component for the unique Pomodoro Timer feature
const PomodoroTimer = ({ currentTask, onTimerComplete }) => {
  const POMODORO_TIME = 25 * 60; // 25 minutes
  const BREAK_TIME = 5 * 60;   // 5 minutes

  const [remaining, setRemaining] = useState(POMODORO_TIME);
  const [status, setStatus] = useState('idle'); // 'idle', 'running', 'break'
  const [intervalId, setIntervalId] = useState(null);

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60).toString().padStart(2, '0');
    const seconds = (time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const startTimer = useCallback((newStatus = 'running', taskFocusTime = POMODORO_TIME / 60) => {
    if (intervalId) return;

    let startTime = newStatus === 'running' ? taskFocusTime * 60 : BREAK_TIME;

    setRemaining(startTime);
    setStatus(newStatus);

    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          setIntervalId(null);
          if (newStatus === 'running') {
            onTimerComplete(currentTask);
            setStatus('break');
            return BREAK_TIME; // Auto-start break
          }
          setStatus('idle');
          return POMODORO_TIME; // Reset to Pomodoro time
        }
        return prev - 1;
      });
    }, 1000);
    setIntervalId(id);
  }, [intervalId, currentTask, onTimerComplete, POMODORO_TIME, BREAK_TIME]);

  const stopTimer = useCallback(() => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    setRemaining(POMODORO_TIME);
    setStatus('idle');
  }, [intervalId, POMODORO_TIME]);

  useEffect(() => {
    // Stop timer when component unmounts
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  // Control timer based on currentTask selection
  useEffect(() => {
    if (currentTask && status === 'idle') {
      // If a task is selected, set timer to its focus time, but don't auto-start
      setRemaining(currentTask.focusTime * 60);
    } else if (!currentTask && status !== 'idle') {
      // If task is removed/completed while running, stop the timer
      stopTimer();
    } else if (!currentTask && status === 'idle') {
      setRemaining(POMODORO_TIME);
    }
  }, [currentTask, status, stopTimer, POMODORO_TIME]);

  const label = useMemo(() => {
    if (status === 'running') return currentTask ? `Focusing on: ${currentTask.title}` : 'Deep Work Session';
    if (status === 'break') return 'Break Time!';
    if (currentTask) return `Ready to focus on: ${currentTask.title}`;
    return 'Select a Task to Focus';
  }, [status, currentTask]);

  const buttonClass = status === 'running' ? 'bg-red-600 hover:bg-red-700' :
    status === 'break' ? 'bg-green-600 hover:bg-green-700' :
      'bg-indigo-600 hover:bg-indigo-700';

  const timeToDisplay = status === 'idle' && currentTask ? currentTask.focusTime * 60 : remaining;

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl mb-8 flex flex-col items-center border border-indigo-700/50">
      <p className="text-sm font-semibold text-indigo-400 mb-2">{label}</p>
      <div className="text-7xl font-extrabold text-white mb-4 tracking-tighter">
        {formatTime(timeToDisplay)}
      </div>
      <div className="flex space-x-3">
        {status !== 'running' && status !== 'break' && (
          <button
            onClick={() => startTimer('running', currentTask ? currentTask.focusTime : 25)}
            disabled={!currentTask}
            className={`px-6 py-2 rounded-full text-white transition duration-200 ${buttonClass} shadow-lg disabled:bg-indigo-400 disabled:cursor-not-allowed`}
          >
            {currentTask ? `Start Focus (${currentTask.focusTime}m)` : 'Select Task'}
          </button>
        )}
        {(status === 'running' || status === 'break') && (
          <button
            onClick={stopTimer}
            className="px-6 py-2 rounded-full bg-gray-600 hover:bg-gray-500 text-white transition duration-200 shadow-lg"
          >
            Stop
          </button>
        )}
        {status === 'running' && (
          <button
            onClick={() => startTimer('break', BREAK_TIME / 60)}
            className="px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition duration-200 shadow-lg"
          >
            Take a Break
          </button>
        )}
      </div>
    </div>
  );
};

// Component for displaying a single Task Card
const TaskCard = ({ task, onUpdateStatus, onStartFocus, onDelete, isFocusing }) => {
  const { id, title, status, focusTime, energyLevel, type } = task;

  const energyClasses = {
    'High': 'bg-red-500 text-red-50 font-bold',
    'Medium': 'bg-yellow-500 text-yellow-900 font-bold',
    'Low': 'bg-green-500 text-green-50 font-bold',
  };

  const typeLabel = type === 'daily' ? 'Daily' : 'Project';
  const typeColor = type === 'daily' ? 'text-purple-400 border-purple-400' : 'text-indigo-400 border-indigo-400';

  const cardBorder = isFocusing ? 'border-4 border-emerald-500 ring-2 ring-emerald-300' : 'border-t-4 border-indigo-500';

  const nextStatus = useMemo(() => {
    if (status === 'todo') return { label: 'Start Work', next: 'in-progress' };
    if (status === 'in-progress') return { label: 'Mark Complete', next: 'complete' };
    if (status === 'complete') return { label: 'Re-open', next: 'todo' };
    return null;
  }, [status]);

  return (
    <div className={`bg-gray-700 p-4 rounded-xl shadow-xl flex flex-col space-y-3 transition duration-300 ${cardBorder}`}>
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-semibold text-white break-words">{title}</h3>
        <span className={`px-2 py-0.5 text-xs rounded-full border ${typeColor} font-medium ml-2`}>
          {typeLabel}
        </span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className={`px-3 py-1 text-xs rounded-full ${energyClasses[energyLevel]} shadow-sm`}>
          {energyLevel} Energy
        </span>
        <span className="text-indigo-300 font-medium flex items-center">
          <svg className="w-4 h-4 inline mr-1 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          {focusTime} mins
        </span>
      </div>

      <div className="flex space-x-2 pt-2 border-t border-gray-600">
        {nextStatus && (
          <button
            onClick={() => onUpdateStatus(id, nextStatus.next)}
            className="flex-1 px-3 py-1 text-xs rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition duration-150 shadow-md"
          >
            {nextStatus.label}
          </button>
        )}
        {status !== 'complete' && (
          <button
            onClick={() => onStartFocus(task)}
            className={`px-3 py-1 text-xs rounded-lg text-white transition duration-150 shadow-md ${isFocusing ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}
            title="Start Pomodoro Timer for this task"
          >
            {isFocusing ? 'Active' : 'Focus'}
          </button>
        )}
        <button
          onClick={() => onDelete(id)}
          className="px-2 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition duration-150 shadow-md"
          title="Delete Task"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </div>
    </div>
  );
};

// Component for adding a new task
const TaskForm = ({ onAddTask, isSubmitting }) => {
  const [title, setTitle] = useState('');
  const [focusTime, setFocusTime] = useState(30);
  const [energyLevel, setEnergyLevel] = useState('Medium');
  const [taskType, setTaskType] = useState('project'); // 'project' or 'daily'

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddTask({
      title: title.trim(),
      focusTime: parseInt(focusTime),
      energyLevel,
      type: taskType,
    });

    setTitle('');
    setFocusTime(30);
    setEnergyLevel('Medium');
  };

  const energyOptions = ['High', 'Medium', 'Low'];

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-2xl shadow-2xl space-y-4 border border-gray-700">
      <h2 className="text-2xl font-bold text-white mb-4">Add New Task</h2>

      {/* Task Type Toggle */}
      <div className="flex justify-around bg-gray-700 rounded-xl p-1 shadow-inner">
        <button
          type="button"
          onClick={() => setTaskType('project')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition duration-150 ${taskType === 'project' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/50' : 'text-gray-400 hover:text-white'
            }`}
        >
          Project Task
        </button>
        <button
          type="button"
          onClick={() => setTaskType('daily')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition duration-150 ${taskType === 'daily' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/50' : 'text-gray-400 hover:text-white'
            }`}
        >
          Daily Routine
        </button>
      </div>

      <input
        type="text"
        placeholder="What needs to be done?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-indigo-500 focus:ring-indigo-500 placeholder-gray-400 transition duration-150"
        required
        aria-label="Task Title"
      />
      <div className="flex space-x-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300 mb-1">Focus Time (min)</label>
          <select
            value={focusTime}
            onChange={(e) => setFocusTime(e.target.value)}
            className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 transition duration-150"
            aria-label="Focus Time"
          >
            {[15, 30, 45, 60, 90, 120].map(time => (
              <option key={time} value={time}>{time} min</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300 mb-1">Energy Required</label>
          <select
            value={energyLevel}
            onChange={(e) => setEnergyLevel(e.target.value)}
            className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 transition duration-150"
            aria-label="Energy Level"
          >
            {energyOptions.map(level => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={isSubmitting || !title.trim()}
        className="w-full p-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition duration-200 disabled:bg-indigo-400 disabled:cursor-not-allowed shadow-md shadow-indigo-500/50"
      >
        {isSubmitting ? 'Adding...' : 'Add Task'}
      </button>
    </form>
  );
};


// Main Application Component
const App = () => {
  const [tasks, setTasks] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentFocusTask, setCurrentFocusTask] = useState(null);
  const [taskTypeFilter, setTaskTypeFilter] = useState('project'); // 'project' or 'daily'
  const { userId, isAuthReady, getTasksCollectionRef, auth } = useAuthAndFirestore();

  const userName = useMemo(() => {
    if (auth && auth.currentUser && auth.currentUser.email) {
      return auth.currentUser.email.split('@')[0];
    }
    if (userId && userId.length > 8) {
      return `User_${userId.substring(0, 4)}`;
    }
    return 'Guest';
  }, [userId, auth]);

  // 1. Task Fetching (Real-time Firestore Listener)
  useEffect(() => {
    const tasksCollectionRef = getTasksCollectionRef();
    if (!isAuthReady || !tasksCollectionRef) return;

    const q = query(tasksCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        // Ensure 'type' defaults to 'project' if missing from older documents
        type: 'project',
        ...doc.data()
      }));
      // Sort by createdAt (oldest first)
      fetchedTasks.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setTasks(fetchedTasks);
    }, (error) => {
      console.error("Error fetching tasks:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, getTasksCollectionRef]);

  // 2. Task Management Functions

  const handleAddTask = async (newTask) => {
    setIsSubmitting(true);
    const tasksCollectionRef = getTasksCollectionRef();
    if (!tasksCollectionRef) {
      console.error("Firestore not ready.");
      setIsSubmitting(false);
      return;
    }

    const taskData = {
      ...newTask,
      status: 'todo',
      createdAt: new Date(),
      userId: userId,
    };

    try {
      await addDoc(tasksCollectionRef, taskData);
    } catch (error) {
      console.error("Error adding document: ", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    const tasksCollectionRef = getTasksCollectionRef();
    if (!tasksCollectionRef) return;

    try {
      const taskDocRef = doc(tasksCollectionRef, taskId);
      await updateDoc(taskDocRef, { status: newStatus });
      // If the completed task was in focus, stop the focus timer
      if (newStatus === 'complete' && currentFocusTask?.id === taskId) {
        setCurrentFocusTask(null);
      }
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    const tasksCollectionRef = getTasksCollectionRef();
    if (!tasksCollectionRef) return;

    try {
      const taskDocRef = doc(tasksCollectionRef, taskId);
      await deleteDoc(taskDocRef);
      if (currentFocusTask?.id === taskId) {
        setCurrentFocusTask(null);
      }
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
  }

  const handleStartFocus = (task) => {
    setCurrentFocusTask(task);
    // Automatically move task to 'in-progress' when focus starts
    if (task.status === 'todo') {
      handleUpdateTaskStatus(task.id, 'in-progress');
    }
  };

  const handlePomodoroComplete = (task) => {
    console.log(`Pomodoro session complete for: ${task.title}`);
  }

  const filteredTasks = useCallback((status) => {
    return tasks.filter(task => task.status === status && task.type === taskTypeFilter);
  }, [tasks, taskTypeFilter]);

  const statusColumns = useMemo(() => ([
    { status: 'todo', title: 'To Do', color: 'bg-indigo-500', icon: <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg> },
    { status: 'in-progress', title: 'In Progress', color: 'bg-yellow-500', icon: <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> },
    { status: 'complete', title: 'Complete', color: 'bg-green-500', icon: <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> },
  ]), []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p className="text-xl">Loading TaskFlow... (Authenticating with Firebase)</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-gray-100 p-4 sm:p-8">
      <header className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-indigo-400 tracking-tight mb-1">
          Bimbanee's <span className="text-white text-3xl">TaskFlow</span>
        </h1>
        <p className="text-lg text-gray-400 mb-4">Welcome back, <span className="text-white font-semibold">{userName}</span>!</p>
        <p className="text-xs text-gray-500">Authenticated User ID: {userId}</p>
      </header>

      <PomodoroTimer
        currentTask={currentFocusTask}
        onTimerComplete={handlePomodoroComplete}
      />

      {/* Task Type Filter */}
      <div className="flex justify-center space-x-4 mb-8">
        <button
          onClick={() => setTaskTypeFilter('project')}
          className={`py-3 px-8 rounded-full font-bold text-lg transition duration-150 ${taskTypeFilter === 'project' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/50 scale-105' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
          Project Tasks
        </button>
        <button
          onClick={() => setTaskTypeFilter('daily')}
          className={`py-3 px-8 rounded-full font-bold text-lg transition duration-150 ${taskTypeFilter === 'daily' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/50 scale-105' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
          Daily Routines
        </button>
      </div>
      {/* Display message based on selected filter */}
      <p className="text-center text-gray-400 mb-6 font-medium">
        {taskTypeFilter === 'project' ?
          "Focusing on large, strategic project tasks." :
          "Managing recurring tasks and daily commitments."
        }
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Task Form Column */}
        <div className="lg:col-span-1">
          <TaskForm
            onAddTask={handleAddTask}
            isSubmitting={isSubmitting}
          />
          <div className="mt-6 p-6 bg-gray-800 rounded-2xl shadow-xl border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-3">Task Stats</h3>
            <p className="text-sm text-gray-400">Total {taskTypeFilter === 'project' ? 'Project' : 'Daily'} Tasks: <span className="font-bold text-indigo-400">{tasks.filter(t => t.type === taskTypeFilter).length}</span></p>
            <p className="text-sm text-gray-400 mt-2">Use the Focus Time and Energy Score to batch similar work and hit flow state faster.</p>
          </div>
        </div>

        {/* Kanban Board Columns (3/4 width on large screens) */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          {statusColumns.map(({ status, title, color, icon }) => (
            <div key={status} className="p-4 rounded-2xl bg-gray-800 shadow-2xl min-h-[450px] border border-gray-700">
              <h2 className={`flex items-center text-xl font-bold text-white mb-4 p-3 rounded-xl ${color} bg-opacity-30 border-b-2 border-opacity-70 ${color.replace('bg-', 'border-')} shadow-md`}>
                {icon}
                {title} ({filteredTasks(status).length})
              </h2>
              <div className="space-y-4">
                {filteredTasks(status).map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onUpdateStatus={handleUpdateTaskStatus}
                    onStartFocus={handleStartFocus}
                    onDelete={handleDeleteTask}
                    isFocusing={currentFocusTask?.id === task.id}
                  />
                ))}
              </div>
              {filteredTasks(status).length === 0 && (
                <p className="text-center text-gray-500 mt-10 p-4 rounded-lg bg-gray-700/50">
                  {status === 'todo' ? `Time to add a new ${taskTypeFilter} task!` :
                    status === 'in-progress' ? 'Get started by clicking the "Focus" button on a task.' :
                      'Mission accomplished! Enjoy your free time.'}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="mt-12 pt-6 border-t border-gray-700 text-center">
        <p className="text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Bimbanee's TaskFlow. All rights reserved.
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Developed with React, Firebase Firestore, and the Pomodoro Technique.
        </p>
      </footer>
    </div>
  );
};

export default App;

