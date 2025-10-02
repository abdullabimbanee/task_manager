# 🚀 Bimbanee's TaskFlow  
**Focus-Driven Project & Daily Manager**

Bimbanee's TaskFlow is a **modern task management app** that goes beyond a simple to-do list.  
It helps you **prioritize work based on Focus Time and Energy Levels**, featuring a **Pomodoro timer, Kanban workflow, and real-time Firebase sync**.  

![TaskFlow Preview]([./src/assets/preview.png]) <!-- Replace with actual screenshot path -->

---

## ✨ Features  

✅ **Integrated Pomodoro Timer** – Start a focus session (default 25 min) directly from any task. Task automatically moves to **In Progress**.  

✅ **Focus & Energy Scoring** – Assign each task:  
- ⏱️ *Focus Time (min)* – estimated completion time  
- ⚡ *Energy Required* – High, Medium, or Low  

✅ **Task Segmentation** – Organize tasks as:  
- 📂 *Project Tasks* (long-term goals)  
- 🔄 *Daily Routines* (recurring habits & appointments)  

✅ **Kanban Workflow** – A clean board with **To Do → In Progress → Complete**.  

✅ **Real-time Data Persistence** – Tasks are synced with **Firebase Firestore** across sessions.  

✅ **Personalized Greeting** – Authenticated users see their **name or ID**.  

✅ **Modern Dark UI** – Built with **React + Tailwind CSS**.  

---

## 🖥️ Tech Stack  

- **Frontend:** React (Vite)  
- **Styling:** Tailwind CSS  
- **State Management:** React Hooks (useState, useEffect, useCallback, useMemo)  
- **Database & Auth:** Google Firebase (Firestore & Authentication)  

---

## ⚙️ Installation & Setup  

### 1️⃣ Prerequisites  
- [Node.js](https://nodejs.org/) (LTS recommended)  
- npm or yarn  
- A Firebase Project  

---

### 2️⃣ Clone the Repository & Install Dependencies  

```bash
git clone <your-repo-url>
cd bimbanees-taskflow
npm install
npm install firebase
```
---

### 3️⃣ Configure Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```
- Ensure tailwind.config.js scans your React components.

### 4️⃣ Firebase Configuration
- Create a .env file in the root folder:

```. env
VITE_FIREBASE_CONFIG='{ 
  "apiKey": "...", 
  "authDomain": "...", 
  "projectId": "...", 
  "storageBucket": "...", 
  "messagingSenderId": "...", 
  "appId": "..." 
}'
VITE_APP_ID="<YOUR_PROJECT_ID>"

```
