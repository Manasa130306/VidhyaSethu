# Vidyasethu
An intelligent, next-generation autonomous exam paper generator designed to balance Bloom's Taxonomy, Course Outcomes (COs), Program Outcomes (POs), and manage precise multi-set questionnaire generations with 0% duplication across sets.
Designed for universities, colleges, and educational departments to generate high-quality, reliable, and compliant examination sheets with zero friction.
---
## 🌟 Key Features
- **Automated Exam Generation**: Effortlessly generate balanced exam questions based on custom syllabi, course outcomes (COs), and program outcomes (POs).
- **Bloom's Taxonomy Alignment**: Weight and map question papers dynamically across different cognitive domain levels (Remembering, Understanding, Applying, Analyzing, Evaluating, Creating).
- **Multi-Set No-Overlap Engine**: Programmatically generate parallel question sets (Set A, Set B, etc.) with $0\%$ duplicate questions to ensure maximum confidentiality and integrity.
- **Manual Question Repair & Builder**: Complete interactive UI to edit questions directly, modify multiple-choice options, remove elements by list indexes, or append brand-new custom questions.
- **Export to PDF (jsPDF)**: Instant, beautiful, and highly polished PDF downloads matching official university formats, complete with sections, evaluation instructions, and mark allocations.
- **Analytical Insights Dashboard (Recharts)**: High-resolution visual diagrams tracking outcome coverage rates, weight distribution, and cognitive level percentages.
- **History Logs & Persistent Archiving**: Robust integrations with Firestore to automatically save generated sessions, permitting instant retrieval or secure removal.
---
🛠️ Technical Stack
- **Frontend**: Single Page Application (SPA) powered by **React 18+**, **TypeScript**, and **Vite**.
- **Animations**: **Framer Motion** (`motion/react`) for fluid and gorgeous transitions between steps.
- **Styling**: **Tailwind CSS** with a futuristic Galactic Dark slate ecosystem.
- **Backend & Database**:
  - Node.js + Express: Seamlessly routing APIs and bridging static bundles.
  - Firebase Auth & Firestore: Secure customer auth states and global paper history archives.
  - SQLite Database: Local schema stores to handle quick structural queries.
- AI Core: Official Google Gemini API (`@google/genai` SDK) for lightning-fast, high-precision educational content synthesis.

📂 Project Structure
├── package.json               # Manifest file containing dependencies & execution scripts
├── server.ts                  # Hybrid development & production Express server
├── firestore.rules            # Backend security restrictions for Firestore database
├── schema.sql                 # SQLite schema declarations
├── vidyasethu.db              # SQLite relational persistent database file
├── vite.config.ts             # Compilation pipeline configs using Vite
├── src/
│   ├── main.tsx               # Frontend client container bootstrap
│   ├── App.tsx                # Core React dashboard containing all flows
│   ├── firebase.ts            # Client initialization for Firebase Auth/Firestore
│   ├── types.ts               # Global TypeScript custom declarations
│   └── services/
│       └── geminiService.ts   # Core prompt pipelines & Gemini SDK orchestration
└── README.md                  # Comprehensive documentation

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
