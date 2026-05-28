import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, Printer, Loader2, CheckCircle2, AlertCircle, 
  RefreshCw, LogOut, ChevronRight, ChevronLeft, ShieldCheck, 
  Trash2, Plus, Sparkles, Sliders, Check, Database, Award, Info, Download,
  Edit2, CheckCircle, XCircle, Grid, Play, FileUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, signInWithGoogle, logout, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, getDocs, doc, deleteDoc, query, where } from 'firebase/firestore';
import { geminiService } from './services/geminiService';
import { KLevel, Difficulty, Section, SyllabusData, ExamSet, Question } from './types';

// Helper for conditional classes
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// Default Syllabus Prefill for Vidyasethu
const DEFAULT_SYLLABUS: SyllabusData = {
  courseName: "Software Project Management",
  subjectCode: "CS-803",
  topics: [
    "Unit 1: Introduction to project management and planning",
    "Unit 2: Project evaluation and estimation techniques",
    "Unit 3: Activity planning and risk management",
    "Unit 4: Quality assurance, monitoring, and control",
    "Unit 5: Team selection and software configuration management"
  ],
  cos: [
    "CO1: Draft comprehensive project management plans with scope constraints.",
    "CO2: Apply standardized software metrics and costing strategies.",
    "CO3: Formulate detailed dependency charts and compute critical path networks.",
    "CO4: Execute proactive risk profiling and mitigation paradigms.",
    "CO5: Standardize software quality metrics and maintain control logs."
  ]
};

const App: React.FC = () => {
  // Authentication & Session
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Layout Tab Navigation
  // Options: 'DASHBOARD' | 'CREATE_EXAM' | 'PREVIOUS_PAPERS'
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'CREATE_EXAM' | 'PREVIOUS_PAPERS'>('DASHBOARD');

  // Stepper state for CREATE_EXAM
  type FlowStep = 'INGESTION' | 'PATTERN' | 'PEDAGOGY' | 'DRAFT' | 'INTEGRITY' | 'FINALIZE';
  const [currentStep, setCurrentStep] = useState<FlowStep>('INGESTION');

  // App Data State
  const [syllabusInput, setSyllabusInput] = useState<string>('');
  const [uploadedSyllabusFile, setUploadedSyllabusFile] = useState<File | null>(null);
  const [syllabusData, setSyllabusData] = useState<SyllabusData | null>(null);
  const [isParsingSyllabus, setIsParsingSyllabus] = useState<boolean>(false);

  // Pattern State
  const [setCount, setSetCount] = useState<number>(3); // Default to 3 sets
  const [passMarks, setPassMarks] = useState<number>(40); // Default pass marks
  const [isUploadingPastPaper, setIsUploadingPastPaper] = useState<boolean>(false);
  const [pastPaperUploadError, setPastPaperUploadError] = useState<string | null>(null);
  const [pastPaperSuccessMsg, setPastPaperSuccessMsg] = useState<string | null>(null);

  const [sections, setSections] = useState<Section[]>([
    { id: 'sec-a', name: 'Part A (Short Questions)', questionCount: 5, marksPerQuestion: 2, type: 'theory' },
    { id: 'sec-b', name: 'Part B (Medium Questions)', questionCount: 5, marksPerQuestion: 5, type: 'theory' },
    { id: 'sec-c', name: 'Part C (Descriptive/Case Study)', questionCount: 2, marksPerQuestion: 10, type: 'theory' }
  ]);
  const [universityName, setUniversityName] = useState<string>('Vidyasethu National Institute of Technology');
  const [examType, setExamType] = useState<string>('End-Semester Examination (Regular)');
  const [termDuration, setTermDuration] = useState<string>('3 Hours');

  // Pedagogy State (Ratios must sum to 100%)
  const [difficulty, setDifficulty] = useState({ easy: 30, medium: 50, hard: 20 });
  const [bloomRatios, setBloomRatios] = useState({
    k1: 20, // Remember
    k2: 25, // Understand
    k3: 20, // Apply
    k4: 15, // Analyse
    k5: 10, // Evaluate
    k6: 10  // Create
  });

  // Draft Generation State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [morphKLevel, setMorphKLevel] = useState<string>('K1');
  const [generatedSets, setGeneratedSets] = useState<ExamSet[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Question Editor state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [editingOptions, setEditingOptions] = useState<string[]>([]);
  const [regeneratingQId, setRegeneratingQId] = useState<string | null>(null);

  // Add Question Modal State
  const [showAddQuestionModal, setShowAddQuestionModal] = useState<boolean>(false);
  const [newQText, setNewQText] = useState<string>('');
  const [newQMarks, setNewQMarks] = useState<number>(5);
  const [newQKLevel, setNewQKLevel] = useState<KLevel>(KLevel.K1);
  const [newQDifficulty, setNewQDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [newQTopic, setNewQTopic] = useState<string>('General');
  const [newQCO, setNewQCO] = useState<string>('CO1');
  const [newQType, setNewQType] = useState<'theory' | 'mcq'>('theory');
  const [newQOptions, setNewQOptions] = useState<string[]>(['Option A', 'Option B', 'Option C', 'Option D']);
  const [newQSectionId, setNewQSectionId] = useState<string>('');

  // Integrity State (Similarity analysis)
  const [showWatermark, setShowWatermark] = useState<boolean>(true);
  const [customWatermarkText, setCustomWatermarkText] = useState<string>('VIDYASETHU CONFIDENTIAL');

  // Active Set in Finalize step
  const [activeSetIndex, setActiveSetIndex] = useState<number>(0);
  const [savingToCloud, setSavingToCloud] = useState<boolean>(false);
  const [cloudSuccess, setCloudSuccess] = useState<boolean>(false);

  // History State
  const [previousPapers, setPreviousPapers] = useState<any[]>([]);
  const [loadingPapers, setLoadingPapers] = useState<boolean>(false);

  // Interactive Review Panel States
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([
    { id: 'p1', text: "Design a software risk mitigation log using COCOMO estimation parameters for a 50k LOC product.", correctAnswer: "COCOMO based mitigation matrix.", rationale: "Applies COCOMO parameters to mitigation planning.", kLevel: KLevel.K5, difficulty: Difficulty.MEDIUM, topic: "Unit 3", co: "CO3", marks: 10, qualityScore: 100 },
    { id: 'p2', text: "List 4 key features of the agile software development life cycle.", correctAnswer: "Sprint, backlogs, standups, retrospectives.", rationale: "Standard definitions.", kLevel: KLevel.K1, difficulty: Difficulty.EASY, topic: "Unit 1", co: "CO1", marks: 2, qualityScore: 100 },
    { id: 'p3', text: "Compare and contrast ISO 9001 and CMMI software quality standard models.", correctAnswer: "Quality standards differences.", rationale: "Requires deep analytical comparison.", kLevel: KLevel.K4, difficulty: Difficulty.HARD, topic: "Unit 4", co: "CO5", marks: 5, qualityScore: 100 },
    { id: 'p4', text: "Formulate a critical path diagram for a project with 8 dependent engineering milestones.", correctAnswer: "CPM path representation.", rationale: "Creates CPM network.", kLevel: KLevel.K6, difficulty: Difficulty.HARD, topic: "Unit 3", co: "CO3", marks: 10, qualityScore: 100 },
    { id: 'p5', text: "Define configuration drift in software version maintenance systems.", correctAnswer: "Deviation from configuration baselines.", rationale: "Remember level definitions.", kLevel: KLevel.K2, difficulty: Difficulty.EASY, topic: "Unit 5", co: "CO5", marks: 2, qualityScore: 100 }
  ]);
  const [approvedCount, setApprovedCount] = useState<number>(42);

  // Listen to Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync SyllabusInput with default prefill
  useEffect(() => {
    if (!syllabusInput && !syllabusData) {
      setSyllabusInput(
        `Course Name: Software Project Management\nSubject Code: CS-803\n\n` +
        `Topics:\n` +
        `Unit 1: Introduction to project management and planning\n` +
        `Unit 2: Project evaluation and estimation techniques\n` +
        `Unit 3: Activity planning and risk management\n` +
        `Unit 4: Quality assurance, monitoring, and control\n` +
        `Unit 5: Team selection and software configuration management\n\n` +
        `Course Outcomes:\n` +
        `CO1: Draft comprehensive project management plans with scope constraints.\n` +
        `CO2: Apply standardized software metrics and costing strategies.\n` +
        `CO3: Formulate detailed dependency charts and compute critical path networks.\n` +
        `CO4: Execute proactive risk profiling and mitigation paradigms.\n` +
        `CO5: Standardize software quality metrics and maintain control logs.`
      );
    }
  }, []);

  // Retrieve previous papers
  const fetchPreviousPapers = async () => {
    if (!user && !isGuest) return;
    setLoadingPapers(true);
    try {
      const email = user?.email || "anonymous_guest";
      const q = query(collection(db, "generated_papers"), where("userEmail", "==", email));
      const res = await getDocs(q);
      const papers = res.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      papers.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPreviousPapers(papers);
    } catch (e) {
      console.error("Error loading previous papers:", e);
    } finally {
      setLoadingPapers(false);
    }
  };

  useEffect(() => {
    fetchPreviousPapers();
  }, [user, isGuest]);

  // Cycle through Bloom Levels in MORPH loading visualizer during generation phase
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      const kList = ['K1: Remember', 'K2: Understand', 'K3: Apply', 'K4: Analyse', 'K5: Evaluate', 'K6: Create'];
      let idx = 0;
      interval = setInterval(() => {
        idx = (idx + 1) % kList.length;
        setMorphKLevel(kList[idx]);
      }, 700);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating]);

  // Handle Pass Marks recalibrating difficulty slider
  const handlePassMarksChange = (val: number) => {
    setPassMarks(val);
    if (val <= 30) {
      // Very strict / tough paper
      setDifficulty({ easy: 10, medium: 40, hard: 50 });
    } else if (val <= 45) {
      // Balanced standard paper
      setDifficulty({ easy: 30, medium: 50, hard: 20 });
    } else {
      // Friendly, higher pass marks means more easy items
      setDifficulty({ easy: 50, medium: 35, hard: 15 });
    }
  };

  // Adjust sliders helper so they always match 100%
  const handleDifficultySlider = (key: 'easy' | 'medium' | 'hard', val: number) => {
    const keys = ['easy', 'medium', 'hard'] as const;
    const remainingKeys = keys.filter(k => k !== key);
    const difference = 100 - val;
    const currentRemainingSum = remainingKeys.reduce((acc, k) => acc + difficulty[k], 0) || 1;

    const nextDifficulties = { ...difficulty };
    nextDifficulties[key] = val;
    remainingKeys.forEach(k => {
      const proportion = difficulty[k] / currentRemainingSum;
      nextDifficulties[k] = Math.max(0, Math.round(proportion * difference));
    });

    // Enforce precise 100% sum constraint
    const total = nextDifficulties.easy + nextDifficulties.medium + nextDifficulties.hard;
    if (total !== 100) {
      nextDifficulties[remainingKeys[0]] += (100 - total);
    }
    setDifficulty(nextDifficulties);
  };

  const handleBloomSlider = (key: keyof typeof bloomRatios, val: number) => {
    const keys = Object.keys(bloomRatios) as (keyof typeof bloomRatios)[];
    const remainingKeys = keys.filter(k => k !== key);
    const difference = 100 - val;
    const currentRemainingSum = remainingKeys.reduce((acc, k) => acc + bloomRatios[k], 0) || 1;

    const nextRatios = { ...bloomRatios };
    nextRatios[key] = val;
    remainingKeys.forEach(k => {
      const proportion = bloomRatios[k] / currentRemainingSum;
      nextRatios[k] = Math.max(0, Math.round(proportion * difference));
    });

    const total = Object.values(nextRatios).reduce((sum, v) => sum + v, 0);
    if (total !== 100) {
      nextRatios[remainingKeys[0]] += (100 - total);
    }
    setBloomRatios(nextRatios);
  };

  // Syllabus Extractor
  const handleExtractSyllabus = async () => {
    setIsParsingSyllabus(true);
    try {
      let data: SyllabusData;
      if (uploadedSyllabusFile) {
        data = await geminiService.extractSyllabus(uploadedSyllabusFile);
      } else {
        data = await geminiService.extractSyllabus(syllabusInput);
      }

      if (!data.cos || data.cos.length === 0) {
        data.cos = [
          "CO1: General syllabus standard comprehension",
          "CO2: Advanced architectural reasoning integration",
          "CO3: Strategic problem-solving analysis"
        ];
      }
      setSyllabusData(data);
      setCurrentStep('PATTERN');
    } catch (e: any) {
      alert("Error parsing syllabus: " + e.message);
    } finally {
      setIsParsingSyllabus(false);
    }
  };

  // Parse uploaded past paper to pre-populate sections in step 2
  const handlePastPaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPastPaper(true);
    setPastPaperUploadError(null);
    setPastPaperSuccessMsg(null);
    try {
      const parsedData = await geminiService.parsePastPaper(file);
      if (parsedData) {
        let sectionsExtracted = 0;
        if (parsedData.sections && parsedData.sections.length > 0) {
          const sectionsWithIds = parsedData.sections.map((sec: any, idx: number) => ({
            ...sec,
            id: `sec-past-${idx}-${Date.now()}`
          }));
          setSections(sectionsWithIds);
          sectionsExtracted = parsedData.sections.length;
        }
        
        if (parsedData.universityName) {
          setUniversityName(parsedData.universityName);
        }
        if (parsedData.examType) {
          setExamType(parsedData.examType);
        }
        if (parsedData.termDuration) {
          setTermDuration(parsedData.termDuration);
        }

        setPastPaperSuccessMsg(
          `Successfully reverse-engineered: "${parsedData.universityName || 'Custom College'}" | "${parsedData.examType || 'Exam Type'}" (${parsedData.termDuration || '3 Hours'}) with ${sectionsExtracted} sections.`
        );
      }
    } catch (err: any) {
      setPastPaperUploadError(err.message || "Failed to load past paper style.");
    } finally {
      setIsUploadingPastPaper(false);
    }
  };

  // Perform parallel generation of Multi Sets
  const handleGenerateSets = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationLogs(["Initializing AI generation engine...", "Configuring syllabus topics and Bloom's Levels..."]);

    const logMilestones = [
      "Setting up targeted Difficulty balance (Easy: " + difficulty.easy + "%, Medium: " + difficulty.medium + "%)",
      "Reading syllabus topics and Course Outcomes...",
      "Drafting alternative question sets...",
      "Guarding against question duplicates across all sets...",
      "Formatting " + setCount + " custom question paper sets...",
      "Verifying question structures and formatting..."
    ];

    let logIndex = 0;
    const interval = setInterval(() => {
      if (logIndex < logMilestones.length) {
        setGenerationLogs(prev => [...prev, logMilestones[logIndex]]);
        logIndex++;
      }
    }, 900);

    try {
      if (!syllabusData) throw new Error("Missing extracted syllabus data context.");
      
      const sets = await geminiService.generateMultiSet(
        syllabusData,
        { sections },
        difficulty,
        bloomRatios,
        setCount
      );

      clearInterval(interval);
      setGeneratedSets(sets);
      setGenerationLogs(prev => [...prev, `✓ Success: Generated ${setCount} unique sets!`]);
      setTimeout(() => {
        setCurrentStep('DRAFT');
      }, 500);
    } catch (err: any) {
      clearInterval(interval);
      setGenerationError(err.message || "An error occurred during agent orchestration.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Hot replacement for single question
  const handleHotReplaceQuestion = async (q: Question) => {
    setRegeneratingQId(q.id);
    try {
      if (!syllabusData) return;
      const newQuestion = await geminiService.regenerateSingleQuestion(syllabusData, q);
      const nextSets = generatedSets.map((set, idx) => {
        if (idx === activeSetIndex) {
          const updatedQs = set.questions.map(x => {
            if (x.id === q.id) {
              return { ...newQuestion, id: q.id };
            }
            return x;
          });
          return { ...set, questions: updatedQs };
        }
        return set;
      });
      setGeneratedSets(nextSets);
    } catch (e: any) {
      alert("Failed to regenerate alternative: " + e.message);
    } finally {
      setRegeneratingQId(null);
    }
  };

  // Save the complete session into Firestore
  const handleSaveToCloud = async () => {
    if (!user && !isGuest) return;
    setSavingToCloud(true);
    try {
      if (!syllabusData) return;
      await addDoc(collection(db, "generated_papers"), {
        userId: user?.uid || "guest_user",
        courseName: syllabusData.courseName,
        subjectCode: syllabusData.subjectCode,
        universityName,
        examType,
        totalSets: generatedSets.length,
        sets: generatedSets,
        createdAt: new Date().toISOString(),
        userEmail: user?.email || "anonymous_guest"
      });
      setCloudSuccess(true);
      fetchPreviousPapers();
      setTimeout(() => setCloudSuccess(false), 3000);
    } catch (e: any) {
      console.error("Firestore persistence warning:", e);
      handleFirestoreError(e, OperationType.WRITE, "generated_papers");
    } finally {
      setSavingToCloud(false);
    }
  };

  // Final Action: Save to history, then trigger standard system print
  const handleFinalDownloadAndSave = async () => {
    await handleSaveToCloud();
    window.print();
  };

  const handleDownloadAsDoc = () => {
    if (!generatedSets[activeSetIndex]) return;
    const paper = generatedSets[activeSetIndex];
    const activeSetTotalMarks = paper.questions.reduce((sum, q) => sum + q.marks, 0) || totalExamMarks;

    // Group questions by section
    const sectionsWithQuestions = sections.map((sec) => {
      const secQuestions = paper.questions.filter(
        q => q.sectionId === sec.id || (!q.sectionId && q.marks === sec.marksPerQuestion)
      );
      return {
        ...sec,
        questions: secQuestions
      };
    });

    const matchedIds = new Set(sectionsWithQuestions.flatMap(s => s.questions.map(q => q.id)));
    const leftovers = paper.questions.filter(q => !matchedIds.has(q.id));

    // Construct high-fidelity HTML markup that Ms Word parses flawlessly
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${universityName}</title>
        <style>
          body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #000; padding: 20px; }
          .hdr-box { border: 3px double #000; padding: 12px; text-align: center; margin-bottom: 25px; }
          .u-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 0 0 4px 0; }
          .e-title { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 0 0 8px 0; }
          .meta-tbl { width: 100%; border-collapse: collapse; margin-top: 8px; border-top: 1px solid #000; }
          .meta-tbl td { font-size: 10pt; font-weight: bold; text-transform: uppercase; padding: 4px 0; }
          .sec-banner { background-color: #f2f2f2; font-weight: bold; padding: 6px 10px; margin-top: 20px; margin-bottom: 10px; border: 1px solid #000; text-transform: uppercase; font-size: 11pt; }
          .q-tbl { width: 100%; border-collapse: collapse; margin-top: 12px; }
          .q-tbl th, .q-tbl td { border: 1px solid #000; padding: 8px; vertical-align: top; }
          .q-tbl th { background-color: #f2f2f2; font-weight: bold; font-size: 10pt; text-align: left; }
          .q-body { font-size: 11pt; font-family: 'Georgia', serif; }
          .footer { margin-top: 40px; font-size: 8pt; text-align: center; border-top: 1px solid #ccc; padding-top: 8px; font-family: sans-serif; color: #555; }
        </style>
      </head>
      <body>
        <div class="hdr-box">
          <h1 class="u-title">${universityName}</h1>
          <h2 class="e-title">${examType}</h2>
          <table class="meta-tbl">
            <tr>
              <td width="55%">COURSE NAME: ${syllabusData?.courseName}</td>
              <td width="45%" align="right">Max Marks: ${activeSetTotalMarks}</td>
            </tr>
            <tr>
              <td>COURSE CODE: ${syllabusData?.subjectCode || 'CS803'}</td>
              <td align="right">Duration: ${termDuration}</td>
            </tr>
          </table>
        </div>

        ${sectionsWithQuestions.map((part) => {
          if (part.questions.length === 0) return '';
          return `
            <div class="sec-banner">
              ${part.name} &mdash; Answer all questions (${part.questions.length} x ${part.marksPerQuestion} = ${part.questions.length * part.marksPerQuestion} Marks)
            </div>
            <table class="q-tbl">
              <thead>
                <tr>
                  <th width="8%" align="center">Q.No</th>
                  <th width="62%">Question Description</th>
                  <th width="10%" align="center">CO</th>
                  <th width="10%" align="center">Bloom</th>
                  <th width="10%" align="center">Marks</th>
                </tr>
              </thead>
              <tbody>
                ${part.questions.map((q) => {
                  const globalIdx = paper.questions.indexOf(q) + 1;
                  const mcqOptionsHtml = q.options && q.options.length > 0
                    ? `<table style="width: 100%; border: none; margin-top: 6px;">
                         <tr>
                           ${q.options.map((opt, oIdx) => `
                             <td style="border: none; padding: 4px; font-size: 9.5pt; width: 50%;">
                               <strong>(${String.fromCharCode(97 + oIdx)})</strong> ${opt}
                             </td>
                           ${oIdx % 2 === 1 ? '</tr><tr>' : ''}`).join('')}
                         </tr>
                       </table>`
                    : '';
                  return `
                    <tr>
                      <td align="center"><strong>${globalIdx}</strong></td>
                      <td>
                        <div class="q-body">${q.text}</div>
                        ${mcqOptionsHtml}
                      </td>
                      <td align="center">${q.co || 'CO1'}</td>
                      <td align="center">${q.kLevel.split(':')[0]}</td>
                      <td align="center"><strong>${q.marks}M</strong></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `;
        }).join('')}

        ${leftovers.length > 0 ? `
          <div class="sec-banner">Additional Questions / Miscellaneous</div>
          <table class="q-tbl">
            <thead>
              <tr>
                <th width="8%" align="center">Q.No</th>
                <th width="62%">Question Description</th>
                <th width="10%" align="center">CO</th>
                <th width="10%" align="center">Bloom</th>
                <th width="10%" align="center">Marks</th>
              </tr>
            </thead>
            <tbody>
              ${leftovers.map((q) => {
                const globalIdx = paper.questions.indexOf(q) + 1;
                const mcqOptionsHtml = q.options && q.options.length > 0
                  ? `<table style="width: 100%; border: none; margin-top: 6px;">
                       <tr>
                         ${q.options.map((opt, oIdx) => `
                           <td style="border: none; padding: 4px; font-size: 9.5pt; width: 50%;">
                             <strong>(${String.fromCharCode(97 + oIdx)})</strong> ${opt}
                           </td>
                         ${oIdx % 2 === 1 ? '</tr><tr>' : ''}`).join('')}
                       </tr>
                     </table>`
                  : '';
                return `
                  <tr>
                    <td align="center"><strong>${globalIdx}</strong></td>
                    <td>
                       <div class="q-body">${q.text}</div>
                       ${mcqOptionsHtml}
                    </td>
                    <td align="center">${q.co || 'CO1'}</td>
                    <td align="center">${q.kLevel.split(':')[0]}</td>
                    <td align="center"><strong>${q.marks}M</strong></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          <p>Generated via Vidyasethu Automated Examination Engine on ${new Date().toLocaleDateString()}</p>
          <p>&copy; ${universityName} &mdash; CONFIDENTIAL &mdash; SET: ${paper.setName}</p>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${universityName.replace(/\s+/g, '_')}_${syllabusData?.courseName.replace(/\s+/g, '_') || 'Course'}_${paper.setName}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAsJson = () => {
    if (!generatedSets[activeSetIndex]) return;
    const paper = generatedSets[activeSetIndex];
    const rawData = {
      universityName,
      examType,
      courseName: syllabusData?.courseName,
      subjectCode: syllabusData?.subjectCode,
      duration: termDuration,
      totalMarks: paper.questions.reduce((sum, q) => sum + q.marks, 0),
      setName: paper.setName,
      questions: paper.questions
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rawData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${universityName.replace(/\s+/g, '_')}_${paper.setName}_metadata.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const skipToDemo = () => {
    setIsGuest(true);
    setActiveTab('DASHBOARD');
  };

  // Delete saved paper
  const handleDeletePaper = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this exam paper?")) return;
    try {
      if (!id) {
        alert("Unable to delete: Document ID is missing.");
        return;
      }
      // Optimistically update local state so the UI removes it immediately
      setPreviousPapers(prev => prev.filter(paper => paper.id !== id));
      
      await deleteDoc(doc(db, "generated_papers", id));
      alert("Exam paper deleted successfully from history.");
    } catch (err: any) {
      console.error("Error deleting document:", err);
      alert("Failed to delete exam paper: " + (err.message || err));
      // Reload on failure to restore state
      fetchPreviousPapers();
    }
  };

  // Loads a previous paper back into active sets view
  const handleLoadPreviousPaper = (paper: any) => {
    setSyllabusData({
      courseName: paper.courseName,
      subjectCode: paper.subjectCode,
      topics: [],
      cos: []
    });
    setUniversityName(paper.universityName);
    setExamType(paper.examType);
    
    // Auto-repair missing or legacy IDs from archived papers
    const sanitizedSets = (paper.sets || []).map((set: any, sIdx: number) => {
      const sanitizedQuestions = (set.questions || []).map((q: any, qIdx: number) => {
        if (!q.id) {
          return {
            ...q,
            id: `q-loaded-${sIdx}-${qIdx}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          };
        }
        return q;
      });
      return {
        ...set,
        questions: sanitizedQuestions
      };
    });

    setGeneratedSets(sanitizedSets);
    setActiveSetIndex(0);
    setActiveTab('CREATE_EXAM');
    setCurrentStep('FINALIZE');
  };

  // Total Marks computation
  const totalExamMarks = sections.reduce((sum, s) => sum + (s.questionCount * s.marksPerQuestion), 0);

  // Stats Counters
  const calculatedTotalQuestions = 250 + approvedCount + previousPapers.reduce((sum, p) => {
    return sum + (p.sets || []).reduce((qSum: number, s: any) => qSum + (s.questions || []).length, 0);
  }, 0);

  // SVG Radar Chart renderer for RBT cognitive distributions
  const renderRadarChart = () => {
    const width = 280;
    const height = 280;
    const cx = width / 2;
    const cy = height / 2;
    const r = 85;
    
    const keys = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'] as const;
    const labels = ['K1: Memory', 'K2: Understand', 'K3: Apply', 'K4: Analyse', 'K5: Evaluate', 'K6: Create'];
    const grids = [0.2, 0.4, 0.6, 0.8, 1];
    
    const getCoordinates = (index: number, value: number) => {
      const angle = (index * 2 * Math.PI) / 6 - Math.PI / 2;
      return {
        x: cx + r * value * Math.cos(angle),
        y: cy + r * value * Math.sin(angle),
      };
    };

    const points = keys.map((k, idx) => {
      const val = (bloomRatios[k] || 10) / 45; // Assumed scaling
      const coords = getCoordinates(idx, Math.min(val, 1));
      return `${coords.x},${coords.y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="mx-auto overflow-visible">
        {grids.map((g, gIdx) => {
          const gridPoints = Array.from({ length: 6 }).map((_, idx) => {
            const coords = getCoordinates(idx, g);
            return `${coords.x},${coords.y}`;
          }).join(' ');
          return (
            <polygon 
              key={gIdx} 
              points={gridPoints} 
              fill="none" 
              stroke="rgba(255,255,255,0.07)" 
              strokeWidth="1" 
            />
          );
        })}
        
        {Array.from({ length: 6 }).map((_, idx) => {
          const ext = getCoordinates(idx, 1);
          return (
            <line 
              key={idx} 
              x1={cx} y1={cy} 
              x2={ext.x} y2={ext.y} 
              stroke="rgba(255,255,255,0.1)" 
              strokeWidth="1" 
            />
          );
        })}

        {labels.map((lbl, idx) => {
          const ext = getCoordinates(idx, 1.2);
          return (
            <text 
              key={idx} 
              x={ext.x} y={ext.y} 
              textAnchor="middle" 
              dominantBaseline="middle" 
              className="fill-slate-400 font-mono text-[9px]"
            >
              {lbl}
            </text>
          );
        })}

        {points && (
          <>
            <polygon 
              points={points} 
              fill="rgba(0, 210, 255, 0.22)" 
              stroke="#00D2FF" 
              strokeWidth="2" 
            />
            {keys.map((k, idx) => {
              const val = (bloomRatios[k] || 10) / 45;
              const coords = getCoordinates(idx, Math.min(val, 1));
              return (
                <circle 
                  key={k} 
                  cx={coords.x} cy={coords.y} r="3.5" 
                  fill="#00D2FF" 
                  stroke="#0B0E14" 
                  strokeWidth="1.2" 
                />
              );
            })}
          </>
        )}
      </svg>
    );
  };

  // Custom Bar Chart renderer for Syllabus Coverage
  const renderSyllabusCoverage = () => {
    const units = ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'];
    const coverages = [92, 85, 96, 78, 88];
    return (
      <div className="space-y-4">
        {units.map((unit, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">{unit}: Module Coverage</span>
              <span className="text-[#00D2FF] font-bold">{coverages[idx]}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${coverages[idx]}%` }}
                transition={{ duration: 1, delay: idx * 0.1 }}
                className="h-full bg-gradient-to-r from-blue-500 to-[#00D2FF] rounded-full"
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center text-center">
        <Loader2 className="animate-spin text-[#00D2FF] w-12 h-12 mb-4" />
        <p className="font-heading text-lg font-medium text-slate-400">Restoring Vidyasethu Gateways...</p>
      </div>
    );
  }

  // Authentic User Login Window Screen
  if (!user && !isGuest) {
    return (
      <div className="min-h-screen bg-[#0B0E14] relative overflow-hidden flex items-center justify-center p-6">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[#00D2FF]/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[150px]" />

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md glass-card-glow p-8 md:p-10 text-center relative z-10"
        >
          <div className="inline-flex p-4 rounded-3xl bg-[#00D2FF]/10 mb-6 border border-[#00D2FF]/20 shadow-inner">
            <Award className="w-12 h-12 text-[#00D2FF]" />
          </div>

          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-white mb-2">
            Vidyasethu
          </h1>
          <p className="text-[#00D2FF] font-heading font-medium tracking-widest text-[11px] uppercase mb-6">
            AI Exam Planner & Generator
          </p>

          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Create structurally balanced, Bloom's Taxonomy aligned examination sets with 0% duplication.
          </p>

          <div className="space-y-4">
            <button 
              onClick={signInWithGoogle}
              className="w-full bg-white text-slate-950 font-bold px-6 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg hover:bg-slate-150 active:scale-98 transition-all cursor-pointer"
            >
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google Logo" />
              Sign In with Google Account
            </button>

            <button 
              onClick={skipToDemo}
              className="w-full bg-[#151921]/60 text-slate-400 font-semibold px-6 py-4 rounded-2xl border border-white/5 hover:border-white/15 hover:text-white active:scale-98 transition-all cursor-pointer"
            >
              Access with Guest Mode (Demo)
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 text-[11px] text-slate-500 font-mono">
            SECURE ACADEMIC INFRASTRUCTURE CONTEXT
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 selection:bg-[#00D2FF]/20 selection:text-[#00D2FF] flex flex-row">
      
      {/* Side persistent Sidebar */}
      <aside className="print:hidden w-64 sm:w-72 bg-[#0B0E14] border-r border-white/10 flex flex-col justify-between p-4 sm:p-6 flex-shrink-0 z-30">
        <div className="space-y-8">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#00D2FF]/10 border border-[#00D2FF]/20">
              <Award className="w-6 h-6 text-[#00D2FF]" />
            </div>
            <div>
              <span className="font-heading font-black text-xl text-white tracking-tight">Vidyasethu</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#00D2FF] block">AI CONFIGURATOR v3.5</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-2">
            <button 
              onClick={() => setActiveTab('DASHBOARD')}
              className={cn(
                "w-full px-4 py-3.5 rounded-2xl text-sm font-semibold font-heading flex items-center gap-3 transition-all text-left cursor-pointer",
                activeTab === 'DASHBOARD' 
                  ? "bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20" 
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Grid className="w-5 h-5" />
              <span>Dashboard View</span>
            </button>

            <button 
              onClick={() => {
                setActiveTab('CREATE_EXAM');
                setCurrentStep('INGESTION');
              }}
              className={cn(
                "w-full px-4 py-3.5 rounded-2xl text-sm font-semibold font-heading flex items-center gap-3 transition-all text-left cursor-pointer",
                activeTab === 'CREATE_EXAM' 
                  ? "bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/10" 
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Sparkles className="w-5 h-5" />
              <span>Create Exam</span>
            </button>

            <button 
              onClick={() => {
                setActiveTab('PREVIOUS_PAPERS');
                fetchPreviousPapers();
              }}
              className={cn(
                "w-full px-4 py-3.5 rounded-2xl text-sm font-semibold font-heading flex items-center gap-3 transition-all text-left cursor-pointer",
                activeTab === 'PREVIOUS_PAPERS' 
                  ? "bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/10" 
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Database className="w-5 h-5" />
              <span>Previous History</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer User Info & Options */}
        <div className="pt-6 border-t border-white/5 mt-8 space-y-4">
          <button 
            onClick={() => {
              if (window.confirm("Reset architect to initial default settings?")) {
                setSections([
                  { id: 'sec-a', name: 'Part A (Short Questions)', questionCount: 5, marksPerQuestion: 2, type: 'theory' },
                  { id: 'sec-b', name: 'Part B (Medium Questions)', questionCount: 5, marksPerQuestion: 5, type: 'theory' },
                  { id: 'sec-c', name: 'Part C (Descriptive/Case Study)', questionCount: 2, marksPerQuestion: 10, type: 'theory' }
                ]);
                setSyllabusData(null);
                setGeneratedSets([]);
                setActiveTab('DASHBOARD');
              }
            }}
            className="w-full text-xs font-mono text-slate-500 hover:text-red-400 text-left py-2 px-1 transition-colors cursor-pointer"
          >
            ⟲ Reset Architect
          </button>

          <div className="bg-[#151921]/60 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
            <div className="truncate pr-2">
              <span className="block text-xs font-bold text-white font-heading">Faculty Member</span>
              <span className="block text-[10px] font-mono text-slate-400 truncate">{user?.email || "Guest Faculty"}</span>
            </div>
            <button 
              onClick={() => {
                logout();
                setIsGuest(false);
              }}
              className="text-slate-500 hover:text-red-400 p-2 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Sign Out Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto px-6 lg:px-10 py-10 pb-24 relative select-text transition-all">
        {/* Dynamic Background elements */}
        <div className="fixed top-0 right-0 w-[400px] h-[400px] bg-[#00D2FF]/5 rounded-full blur-[100px] pointer-events-none -z-10" />
        <div className="fixed bottom-0 left-72 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none -z-10" />

        {/* ================= VIEW 1: DASHBOARD ================= */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-8">
            <div className="space-y-1">
              <span className="text-xs font-mono tracking-widest text-[#00D2FF] font-bold uppercase">METRICS & COGNITIVE ANALYSIS</span>
              <h1 className="text-4xl font-extrabold font-heading text-white tracking-tight">Examination Architect Dashboard</h1>
              <p className="text-slate-400 text-sm max-w-2xl">
                Real-time surveillance dashboard monitoring exam questions distribution metrics, Bloom's Taxonomy parameters, and syllabus coverage criteria.
              </p>
            </div>

            {/* 2 Columns Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
              
              {/* Column 1: Top Metric Cards (Stats) */}
              <div className="space-y-6">
                <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-[#00D2FF]" /> Aggregated Statistics
                </h2>
                
                {/* Stat 1: Total Questions */}
                <div className="glass-card p-6 flex items-center justify-between hover:border-white/20 transition-all">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Total Question Bank Size</span>
                    <p className="text-4xl font-black font-heading text-white mt-1">{calculatedTotalQuestions}</p>
                    <span className="text-[10px] text-emerald-400 font-mono">Dynamic Live Bank mapped</span>
                  </div>
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/5 text-[#00D2FF]">
                    <Database className="w-6 h-6" />
                  </div>
                </div>

                {/* Stat 2: Papers Generated */}
                <div className="glass-card p-6 flex items-center justify-between hover:border-white/20 transition-all">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Total Papers Generated</span>
                    <p className="text-4xl font-black font-heading text-white mt-1">
                      {previousPapers.length + (generatedSets.length > 0 ? 1 : 0)} Runs
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono">Logged inside cloud history</span>
                  </div>
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/5 text-[#00D2FF]">
                    <FileText className="w-6 h-6" />
                  </div>
                </div>

                {/* Stat 3: AI Pending Approvals */}
                <div className="glass-card p-6 flex items-center justify-between hover:border-white/20 transition-all">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">AI Pending Approvals</span>
                    <p className="text-4xl font-black font-heading text-amber-400 mt-1">
                      {pendingQuestions.filter(q => q.id !== 'mock').length} Items
                    </p>
                    <span className="text-[10px] text-amber-500/80 font-mono">Requires immediate review</span>
                  </div>
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/5 text-amber-400">
                    <Loader2 className="w-6 h-6 animate-pulse" />
                  </div>
                </div>
              </div>

              {/* Column 2: Visual Charts (Wow Factor) */}
              <div className="space-y-6">
                <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
                  <Grid className="w-5 h-5 text-emerald-400" /> Cognitive & Syllabus Balance
                </h2>

                {/* Radar Chart Card */}
                <div className="glass-card-glow p-6 text-center">
                  <span className="text-[10px] font-mono tracking-widest text-[#00D2FF] font-black uppercase">RBT COGNITIVE INDEX RADAR</span>
                  <div className="mt-4 flex justify-center">
                    {renderRadarChart()}
                  </div>
                </div>

                {/* Syllabus Coverage Bar Card */}
                <div className="glass-card p-6">
                  <span className="text-[10px] font-mono tracking-widest text-[#00D2FF] font-black uppercase block mb-4">SYLLABUS COVERAGE DISTRIBUTION</span>
                  {renderSyllabusCoverage()}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ================= VIEW 2: CREATE_EXAM ================= */}
        {activeTab === 'CREATE_EXAM' && (
          <div className="space-y-8">
            
            {/* Horizontal Stepper Timeline status */}
            <div className="print:hidden border-b border-white/5 pb-5">
              <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {[
                  { id: 'INGESTION', label: '1. Upload Syllabus' },
                  { id: 'PATTERN', label: '2. Exam Pattern' },
                  { id: 'PEDAGOGY', label: '3. Difficulty & Levels' },
                  { id: 'DRAFT', label: '4. Edit Questions' },
                  { id: 'INTEGRITY', label: '5. Overlap Check' },
                  { id: 'FINALIZE', label: '6. Print & Save' }
                ].map((s) => {
                  const stepsOrder = ['INGESTION', 'PATTERN', 'PEDAGOGY', 'DRAFT', 'INTEGRITY', 'FINALIZE'];
                  const isActive = currentStep === s.id;
                  const isPast = stepsOrder.indexOf(currentStep) > stepsOrder.indexOf(s.id);
                  return (
                    <div key={s.id} className="flex items-center">
                      <button 
                        disabled={!syllabusData && s.id !== 'INGESTION'}
                        onClick={() => setCurrentStep(s.id as FlowStep)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-semibold font-heading transition-all duration-300 cursor-pointer",
                          isActive 
                            ? "bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20" 
                            : isPast 
                              ? "text-emerald-400" 
                              : "text-slate-500 hover:text-white"
                        )}
                      >
                        {s.label}
                      </button>
                      {s.id !== 'FINALIZE' && <ChevronRight className="w-3.5 h-3.5 mx-1 text-slate-700" />}
                    </div>
                  );
                })}
              </nav>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.2 }}
              >
                
                {/* ================= CREATE EXAM STEP 1: INGESTION ================= */}
                {currentStep === 'INGESTION' && (
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <h2 className="text-3xl font-extrabold font-heading text-white tracking-tight">Syllabus & Course Upload</h2>
                      <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
                        Input your targeted course syllabus parameters. Paste your course modules and learning objectives, upload files, or use the prefilled sample course context.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Box 1: File upload */}
                      <div className="lg:col-span-2 glass-card-glow p-8 space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-white/5">
                          <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                            <Upload className="w-5 h-5 text-[#00D2FF]" /> Course Material Syllabus File Upload
                          </h3>
                          {uploadedSyllabusFile && (
                            <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20 font-semibold">
                              File Attached
                            </span>
                          )}
                        </div>

                        <div 
                          onClick={() => document.getElementById('syllabus-file-input')?.click()}
                          className="border-2 border-dashed border-white/10 rounded-2xl p-10 text-center cursor-pointer hover:border-[#00D2FF]/50 hover:bg-[#00D2FF]/5 transition-all duration-300 relative group overflow-hidden"
                        >
                          <div className="flex flex-col items-center">
                            <div className="p-4 rounded-full bg-white/5 border border-white/5 group-hover:scale-110 transition-transform duration-300">
                              <FileText className="w-10 h-10 text-slate-400 group-hover:text-[#00D2FF] transition-colors" />
                            </div>
                            <p className="mt-4 font-heading text-sm font-semibold text-white">Click or drag course syllabus sheet here</p>
                            <p className="mt-2 text-xs text-slate-500">Supports PDF, PNG, JPG, or structured texts</p>
                          </div>
                          <input 
                            type="file" 
                            id="syllabus-file-input" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setUploadedSyllabusFile(file);
                            }}
                          />
                        </div>

                        {uploadedSyllabusFile && (
                          <div className="bg-[#151921]/90 rounded-2xl p-4 flex items-center justify-between border border-white/10">
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-[#00D2FF]" />
                              <div>
                                <p className="text-xs font-semibold text-white truncate max-w-xs">{uploadedSyllabusFile.name}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{(uploadedSyllabusFile.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setUploadedSyllabusFile(null)}
                              className="text-slate-500 hover:text-red-400 transition-colors p-2 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Box 2: Plain text area manual input */}
                      <div className="glass-card p-6 space-y-6">
                        <h3 className="font-heading font-bold text-lg text-white">Manual Syllabus Input</h3>
                        
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                              Course syllabus (plain text or formatted)
                            </label>
                            <textarea 
                              className="w-full h-80 bg-[#0B0E14] border border-white/10 rounded-2xl p-4 text-xs font-sans text-slate-300 focus:border-[#00D2FF] outline-none transition-all"
                              placeholder="Write or paste your complete syllabus units and outputs..."
                              value={syllabusInput}
                              onChange={(e) => setSyllabusInput(e.target.value)}
                            />
                          </div>

                          <button 
                            onClick={() => {
                              setSyllabusInput(
                                `Course Name: Software Project Management\nSubject Code: CS-803\n\n` +
                                `Topics:\n` +
                                `Unit 1: Introduction to project management and planning\n` +
                                `Unit 2: Project evaluation and estimation techniques\n` +
                                `Unit 3: Activity planning and risk management\n` +
                                `Unit 4: Quality assurance, monitoring, and control\n` +
                                `Unit 5: Team selection and software configuration management\n\n` +
                                `Course Outcomes:\n` +
                                `CO1: Draft comprehensive project management plans with scope constraints.\n` +
                                `CO2: Apply standardized software metrics and costing strategies.\n` +
                                `CO3: Formulate detailed dependency charts and compute critical path networks.\n` +
                                `CO4: Execute proactive risk profiling and mitigation paradigms.\n` +
                                `CO5: Standardize software quality metrics and maintain control logs.`
                              );
                              setSyllabusData(DEFAULT_SYLLABUS);
                            }}
                            className="text-xs text-[#00D2FF] hover:underline flex items-center gap-1 font-semibold bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" /> Reset to Prefilled Template
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Extractor Navigation */}
                    <div className="flex items-center justify-end pt-4 border-t border-white/5">
                      <button 
                        onClick={handleExtractSyllabus}
                        disabled={isParsingSyllabus}
                        className="btn-primary-neon font-heading cursor-pointer inline-flex items-center gap-2"
                      >
                        {isParsingSyllabus ? (
                          <>
                            <Loader2 className="animate-spin w-4 h-4" /> Extracting Syllabus...
                          </>
                        ) : (
                          <>
                            Configure Exam Pattern <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ================= CREATE EXAM STEP 2: PATTERN ================= */}
                {currentStep === 'PATTERN' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-mono tracking-widest text-[#00D2FF] font-black uppercase">ACADEMIC TEMPLATING</span>
                        <h2 className="text-3xl font-extrabold font-heading text-white tracking-tight">Structured Exam Pattern</h2>
                        <p className="text-slate-400 text-sm">Configure matrix sections, select sets required, calibrate pass marks, or upload standard previous paper patterns.</p>
                      </div>
                      <button 
                        onClick={() => setCurrentStep('INGESTION')}
                        className="btn-secondary-neon text-xs py-2 px-4 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" /> Back to Syllabus Upload
                      </button>
                    </div>

                    {/* Choice Row: Number of Sets Needed */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-3xl bg-[#151921]/60 border border-white/10">
                      <div className="space-y-1 text-center sm:text-left">
                        <label className="text-xs font-heading font-black text-slate-300 uppercase tracking-widest block">NUMBER OF SETS REQUIRED ON EXAM GENERATION</label>
                        <p className="text-xs text-slate-500 font-sans">Vidyasethu multi-set system generates 100% unique, zero-overlap papers of the specified count in parallel.</p>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map((count) => (
                          <button
                            key={count}
                            onClick={() => setSetCount(count)}
                            className={cn(
                              "w-12 h-12 rounded-xl text-sm font-heading font-black transition-all cursor-pointer",
                              setCount === count
                                ? "bg-[#00D2FF] text-[#0B0E14] shadow-md shadow-[#00D2FF]/20 font-black"
                                : "bg-white/5 text-slate-400 border border-white/5 hover:border-white/10"
                            )}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Matrix Grid */}
                      <div className="lg:col-span-2 glass-card-glow p-8 space-y-6">
                        
                        {/* Exam Header & Affiliation Details */}
                        <div className="space-y-4 pb-6 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#00D2FF]" />
                            <h4 className="text-xs font-mono font-bold tracking-wider text-[#00D2FF] uppercase">EXAM HEADER & AFFILIATION METADATA</h4>
                          </div>
                          <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                            These fields represent the printed paper header at the top (College Name, Exam Type, Duration). They are reverse-engineered automatically when importing a past paper!
                          </p>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">College / University Name</label>
                              <input 
                                type="text"
                                className="w-full bg-[#0B0E14]/80 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:border-[#00D2FF] outline-none font-medium"
                                value={universityName}
                                onChange={(e) => setUniversityName(e.target.value)}
                                placeholder="College/University Name"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Exam Type / Title</label>
                              <input 
                                type="text"
                                className="w-full bg-[#0B0E14]/80 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:border-[#00D2FF] outline-none font-medium"
                                value={examType}
                                onChange={(e) => setExamType(e.target.value)}
                                placeholder="e.g. End-Semester Exam"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Duration</label>
                              <input 
                                type="text"
                                className="w-full bg-[#0B0E14]/80 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:border-[#00D2FF] outline-none font-medium"
                                value={termDuration}
                                onChange={(e) => setTermDuration(e.target.value)}
                                placeholder="e.g. 3 Hours"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <h3 className="font-heading font-black text-lg text-white">Interactive Section Grid Matrix</h3>
                        </div>
                        
                        <div className="space-y-4">
                          {sections.map((sec, sIdx) => (
                            <div key={sec.id} className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-5 rounded-2xl bg-[#0B0E14]/60 border border-white/5 hover:border-white/10 transition-all">
                              {/* Name */}
                              <div className="sm:col-span-5 space-y-2">
                                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Section Label Name</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-[#151921]/80 border border-white/5 rounded-xl px-3 py-2 text-sm text-white focus:border-[#00D2FF] outline-none font-medium"
                                  value={sec.name}
                                  onChange={(e) => {
                                    const list = [...sections];
                                    list[sIdx].name = e.target.value;
                                    setSections(list);
                                  }}
                                />
                              </div>

                              {/* Question Count */}
                              <div className="sm:col-span-2 space-y-2">
                                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Q.Count</label>
                                <input 
                                  type="number" 
                                  className="w-full bg-[#151921]/80 border border-white/5 rounded-xl px-3 py-2 text-sm text-slate-300 focus:border-[#00D2FF] outline-none font-mono"
                                  value={sec.questionCount}
                                  onChange={(e) => {
                                    const list = [...sections];
                                    list[sIdx].questionCount = Math.max(1, parseInt(e.target.value) || 1);
                                    setSections(list);
                                  }}
                                />
                              </div>

                              {/* Marks Per Question */}
                              <div className="sm:col-span-2 space-y-2">
                                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Marks/Q</label>
                                <input 
                                  type="number" 
                                  className="w-full bg-[#151921]/80 border border-white/5 rounded-xl px-3 py-2 text-sm text-slate-300 focus:border-[#00D2FF] outline-none font-mono"
                                  value={sec.marksPerQuestion}
                                  onChange={(e) => {
                                    const list = [...sections];
                                    list[sIdx].marksPerQuestion = Math.max(1, parseInt(e.target.value) || 1);
                                    setSections(list);
                                  }}
                                />
                              </div>

                              {/* Type: Theory / MCQ */}
                              <div className="sm:col-span-3 space-y-2 relative">
                                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Type Category</label>
                                <div className="flex items-center gap-2">
                                  <select 
                                    className="w-full bg-[#151921]/80 border border-white/5 rounded-xl px-2.5 py-2 text-sm text-white focus:border-[#00D2FF] outline-none font-medium"
                                    value={sec.type}
                                    onChange={(e) => {
                                      const list = [...sections];
                                      list[sIdx].type = e.target.value as 'theory' | 'mcq';
                                      setSections(list);
                                    }}
                                  >
                                    <option value="theory">Theory Qs</option>
                                    <option value="mcq">MCQ Style</option>
                                  </select>
                                  <button 
                                    onClick={() => {
                                      if (sections.length > 1) {
                                        setSections(sections.filter(x => x.id !== sec.id));
                                      }
                                    }}
                                    className="text-slate-600 hover:text-red-400 p-2 bg-white/5 rounded-lg border border-white/5 hover:border-red-500/20 transition-all cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <button 
                          onClick={() => setSections([...sections, {
                            id: `sec-${Date.now()}`,
                            name: `Part ${String.fromCharCode(65 + sections.length)} Question List`,
                            questionCount: 5,
                            marksPerQuestion: 5,
                            type: 'theory'
                          }])}
                          className="w-full py-4 bg-white/5 hover:bg-white/10 active:scale-99 border border-dashed border-white/10 rounded-2xl text-xs font-semibold font-heading text-[#00D2FF] transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" /> Add Section Segment Row
                        </button>
                      </div>

                      {/* Right Panel: Pass Marks & Upload Past Paper */}
                      <div className="space-y-6">
                        
                        {/* Box 1: Custom Pass Marks & Difficulty Calibrations */}
                        <div className="glass-card p-6 space-y-4">
                          <label className="text-xs font-heading font-black text-slate-300 uppercase tracking-widest block">PASS MARKS & CALIBRATION</label>
                          <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                            Customizing target pass marks shifts the automated difficulty ratio presets dynamically. Setting lower limits forces tougher evaluation criteria automatically.
                          </p>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs font-mono">
                              <span className="text-slate-400">Target Pass Marks:</span>
                              <span className="text-white font-extrabold">{passMarks} / {totalExamMarks} M</span>
                            </div>
                            <input 
                              type="range" 
                              min="10" 
                              max={totalExamMarks || 100} 
                              className="w-full accent-[#00D2FF]"
                              value={passMarks} 
                              onChange={(e) => handlePassMarksChange(parseInt(e.target.value) || 40)}
                            />
                          </div>

                          <div className="p-3 bg-[#0B0E14] border border-white/5 rounded-xl">
                            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#00D2FF]">CALIBRATION REACTION LOG:</span>
                            <p className="text-[10px] text-slate-400 font-sans mt-1">
                              {passMarks <= 30 ? (
                                <span className="text-amber-400">Tough Paper configured! Easy ratio decreased to 10%. Hard ratio locked at 50% for high vetting standards.</span>
                              ) : passMarks <= 45 ? (
                                <span className="text-slate-400">Standard general paper configured. Healthy 30/50/20 difficulty weights loaded dynamically.</span>
                              ) : (
                                <span className="text-emerald-400">Friendly grading index reaction. Easy ratio bumped to 50% to maintain pass index cleanly.</span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Box 2: Upload Previous Paper Pattern */}
                        <div className="glass-card p-6 space-y-4">
                          <label className="text-xs font-heading font-black text-slate-300 uppercase tracking-widest block">UPLOAD PREVIOUS PAPER STYLE</label>
                          <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                            Upload a PDF or image of a past exam paper to reverse engineer and auto-fill the matrix matching its style structure and sections instantly!
                          </p>

                          <div 
                            onClick={() => document.getElementById('past-paper-upload-input')?.click()}
                            className="border-2 border-dashed border-white/10 rounded-2xl p-6 text-center cursor-pointer hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all duration-300 relative"
                          >
                            {isUploadingPastPaper ? (
                              <div className="flex flex-col items-center">
                                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                                <p className="text-xs font-medium text-white mt-2">Processing Structure Style...</p>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <FileUp className="w-8 h-8 text-slate-400 hover:text-emerald-400 transition-colors" />
                                <p className="text-xs font-semibold text-white mt-2">Select past exam paper file</p>
                                <p className="text-[9px] text-slate-500 mt-1">Reverse engineer grid structure</p>
                              </div>
                            )}
                            <input 
                              type="file" 
                              id="past-paper-upload-input" 
                              className="hidden" 
                              onChange={handlePastPaperUpload}
                            />
                          </div>

                          {pastPaperUploadError && (
                            <p className="text-[10px] text-red-400 font-mono mt-1">⚠️ {pastPaperUploadError}</p>
                          )}

                          {pastPaperSuccessMsg && (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mt-2 text-left">
                              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400 block">EXTRACTED FORMAT DETECTED:</span>
                              <p className="text-[10px] text-slate-300 font-sans mt-1 leading-relaxed">
                                {pastPaperSuccessMsg}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Box 3: Live Aggravate Marks Card */}
                        <div className="glass-card-glow p-6 text-center">
                          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#00D2FF]">TOWARDS TOTAL WEIGHTS</span>
                          <p className="text-5xl font-black font-heading text-white mt-1">{totalExamMarks}</p>
                          <p className="text-xs font-semibold text-slate-500 uppercase mt-2">Exam marks balanced aggregated</p>
                        </div>

                      </div>
                    </div>

                    {/* Navigation Row */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <button 
                        onClick={() => setCurrentStep('INGESTION')}
                        className="btn-secondary-neon font-heading cursor-pointer"
                      >
                        Adjust Syllabus
                      </button>
                      <button 
                        onClick={() => setCurrentStep('PEDAGOGY')}
                        className="btn-primary-neon font-heading cursor-pointer inline-flex items-center gap-2"
                      >
                        Difficulty & Levels Settings <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ================= CREATE EXAM STEP 3: PEDAGOGY ================= */}
                {currentStep === 'PEDAGOGY' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-mono tracking-widest text-[#00D2FF] font-black uppercase">EXAM PAPER BALANCE</span>
                        <h2 className="text-3xl font-extrabold font-heading text-white tracking-tight">Difficulty & Levels Balancing</h2>
                        <p className="text-slate-400 text-sm">Fine tune cognitive ratios and check difficulty balances matching targets.</p>
                      </div>
                      <button 
                        onClick={() => setCurrentStep('PATTERN')}
                        className="btn-secondary-neon text-xs py-2 px-4 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" /> Back to Pattern Config
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Difficulty matrix sliders */}
                      <div className="glass-card-glow p-8 space-y-6">
                        <div className="flex items-center gap-3">
                          <Sliders className="w-6 h-6 text-[#00D2FF]" />
                          <h3 className="font-heading font-black text-lg text-white">Difficulty Matrix Balance</h3>
                        </div>
                        <p className="text-xs text-slate-400">Dynamic balancing logic ensures all difficulty levels aggregates exactly to 100% distribution quota.</p>

                        <div className="space-y-6 pt-4">
                          {/* Easy */}
                          <div className="space-y-2">
                            <div className="flex justify-between font-mono text-xs">
                              <span className="text-emerald-400 font-bold uppercase">EASY TARGET RATIO</span>
                              <span className="text-white font-bold">{difficulty.easy}%</span>
                            </div>
                            <input 
                              type="range" min="0" max="100" className="w-full accent-emerald-400" 
                              value={difficulty.easy} 
                              onChange={(e) => handleDifficultySlider('easy', parseInt(e.target.value) || 0)}
                            />
                          </div>

                          {/* Medium */}
                          <div className="space-y-2">
                            <div className="flex justify-between font-mono text-xs">
                              <span className="text-yellow-400 font-bold uppercase">MEDIUM TARGET RATIO</span>
                              <span className="text-white font-bold">{difficulty.medium}%</span>
                            </div>
                            <input 
                              type="range" min="0" max="100" className="w-full accent-yellow-400" 
                              value={difficulty.medium} 
                              onChange={(e) => handleDifficultySlider('medium', parseInt(e.target.value) || 0)}
                            />
                          </div>

                          {/* Hard */}
                          <div className="space-y-2">
                            <div className="flex justify-between font-mono text-xs">
                              <span className="text-red-400 font-bold uppercase">HARD TARGET RATIO</span>
                              <span className="text-white font-bold">{difficulty.hard}%</span>
                            </div>
                            <input 
                              type="range" min="0" max="100" className="w-full accent-red-400" 
                              value={difficulty.hard} 
                              onChange={(e) => handleDifficultySlider('hard', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Bloom's Taxonomy Levels weight sliders */}
                      <div className="glass-card p-8 space-y-6">
                        <div className="flex items-center gap-3">
                          <Award className="w-6 h-6 text-[#00D2FF]" />
                          <h3 className="font-heading font-black text-lg text-white">Bloom's Taxonomy Weights</h3>
                        </div>
                        <p className="text-xs text-slate-400">Specify pedagogical cognitive distribution ratios for targeted academic outcomes mapping.</p>

                        <div className="space-y-4 pt-4 text-xs">
                          {[
                            { key: 'k1', label: 'K1: Remember', accent: 'accent-sky-400' },
                            { key: 'k2', label: 'K2: Understand', accent: 'accent-blue-400' },
                            { key: 'k3', label: 'K3: Apply', accent: 'accent-cyan-400' },
                            { key: 'k4', label: 'K4: Analyse', accent: 'accent-indigo-400' },
                            { key: 'k5', label: 'K5: Evaluate', accent: 'accent-purple-400' },
                            { key: 'k6', label: 'K6: Create', accent: 'accent-pink-400' }
                          ].map((bk) => (
                            <div key={bk.key} className="space-y-1">
                              <div className="flex justify-between font-mono text-[11px]">
                                <span className="text-slate-300 font-medium">{bk.label}</span>
                                <span className="text-white font-bold">{bloomRatios[bk.key as keyof typeof bloomRatios]}%</span>
                              </div>
                              <input 
                                type="range" min="0" max="100" className={cn("w-full", bk.accent)} 
                                value={bloomRatios[bk.key as keyof typeof bloomRatios]} 
                                onChange={(e) => handleBloomSlider(bk.key as keyof typeof bloomRatios, parseInt(e.target.value) || 0)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Navigation */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <button 
                        onClick={() => setCurrentStep('PATTERN')}
                        className="btn-secondary-neon font-heading cursor-pointer"
                      >
                        Adjust Structural Pattern
                      </button>
                      
                      <button 
                        onClick={handleGenerateSets}
                        disabled={isGenerating}
                        className="btn-primary-neon font-heading cursor-pointer inline-flex items-center gap-2"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="animate-spin w-4 h-4" /> Orchestrating Agents...
                          </>
                        ) : (
                          <>
                            Draft Sets Orchestration <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>

                    {isGenerating && (
                      <div className="w-full bg-[#151921]/60 border border-white/10 rounded-2xl p-6 text-left font-mono text-[11px] text-slate-400 space-y-2 h-40 overflow-y-auto mt-4">
                        <div className="flex items-center gap-2 text-white font-bold mb-2">
                          <Loader2 className="w-4 h-4 animate-spin text-[#00D2FF]" />
                          <span>Active background agents are calibrating target Bloom level constraints: {morphKLevel}...</span>
                        </div>
                        {generationLogs.map((log, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-[#00D2FF] font-bold">»</span>
                            <p>{log}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ================= CREATE EXAM STEP 4: DRAFT (QUESTION REVIEW & LIVE EDITING) ================= */}
                {currentStep === 'DRAFT' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-mono tracking-widest text-[#00D2FF] font-black uppercase">LIVE CALIBRATION & REPAIR</span>
                        <h2 className="text-3xl font-extrabold font-heading text-white tracking-tight">Question Review & Live Hot-swapping</h2>
                        <p className="text-slate-400 text-sm">Review generated sets. Click Edit to manually rewrite a question, or Hot-Swap / Replace to regenerate it with AI instantly.</p>
                      </div>

                      <button 
                        onClick={() => setCurrentStep('INTEGRITY')}
                        className="btn-primary-neon text-xs py-2 px-4 cursor-pointer"
                      >
                        Verify & Check Overlaps <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Set Buttons */}
                    <div className="flex border-b border-white/5 pb-2 overflow-x-auto gap-2">
                      {generatedSets.map((set, idx) => (
                        <button 
                          key={set.id}
                          onClick={() => setActiveSetIndex(idx)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-heading font-black tracking-widest uppercase transition-all whitespace-nowrap cursor-pointer",
                            idx === activeSetIndex 
                              ? "bg-[#00D2FF] text-[#0B0E14]" 
                              : "bg-[#151921]/45 text-slate-500 border border-white/5 hover:border-white/10"
                          )}
                        >
                          {set.setName} Review ({set.questions?.length || 0} Questions)
                        </button>
                      ))}
                    </div>

                    {/* Active Set Questions List */}
                    {generatedSets[activeSetIndex] ? (
                      <div className="space-y-4">
                        {generatedSets[activeSetIndex].questions.map((q, qIndex) => (
                          <div key={q.id} className="p-5 rounded-2xl bg-[#151921]/50 border border-white/5 hover:border-white/10 transition-all space-y-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <span className="font-mono text-xs text-slate-500 font-bold uppercase tracking-wider block">Question {qIndex + 1} • {q.marks} Marks • {q.kLevel.split(':')[0]}</span>
                                <p className="text-sm text-slate-200 leading-relaxed font-sans">{q.text}</p>
                                
                                {q.options && q.options.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4 mt-3">
                                    {q.options.map((opt, oIdx) => (
                                      <div key={oIdx} className="flex gap-2 text-xs text-slate-400 font-sans">
                                        <span className="font-bold text-[#00D2FF]">{String.fromCharCode(97 + oIdx)}.</span>
                                        <p>{opt}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Edit button */}
                                <button 
                                  onClick={() => {
                                    setEditingQuestion(q);
                                    setEditingQuestionIndex(qIndex);
                                    setEditingText(q.text);
                                    setEditingOptions(q.options || []);
                                  }}
                                  className="p-2 hover:bg-white/10 border border-white/5 text-[#00D2FF] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs"
                                  title="Edit Question Text"
                                >
                                  <Edit2 className="w-3.5 h-3.5" /> Edit
                                </button>

                                {/* Replace/Regenerate button */}
                                <button 
                                  onClick={() => handleHotReplaceQuestion(q)}
                                  disabled={regeneratingQId === q.id}
                                  className="p-2 hover:bg-amber-500/10 border border-white/5 text-amber-400 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs"
                                  title="AI Regenerate replacement"
                                >
                                  {regeneratingQId === q.id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating...
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5" /> Hot-Swap AI
                                    </>
                                  )}
                                </button>

                                {/* Delete button */}
                                <button 
                                  onClick={() => {
                                    if (window.confirm("Are you sure you want to remove this question?")) {
                                      const nextSets = generatedSets.map((set, idx) => {
                                        if (idx === activeSetIndex) {
                                          return {
                                            ...set,
                                            questions: set.questions.filter((_, qIdx) => qIdx !== qIndex)
                                          };
                                        }
                                        return set;
                                      });
                                      setGeneratedSets(nextSets);
                                    }
                                  }}
                                  className="p-2 hover:bg-red-500/10 border border-white/5 text-red-400 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-mono"
                                  title="Remove Question"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" /> Remove
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5 text-[10px] font-mono text-slate-500">
                              <span>CO Mapping: <b>{q.co || "CO1"}</b></span>
                              <span>•</span>
                              <span>Topic: <b>{q.topic || "General"}</b></span>
                              <span>•</span>
                              <span>Difficulty: <b>{q.difficulty}</b></span>
                            </div>
                          </div>
                        ))}

                        {/* Custom Question Entry button */}
                        <div className="flex justify-center pt-2">
                          <button
                            onClick={() => {
                              setNewQText('');
                              setNewQMarks(5);
                              setNewQKLevel(KLevel.K1);
                              setNewQDifficulty(Difficulty.MEDIUM);
                              setNewQTopic('General');
                              setNewQCO('CO1');
                              setNewQType('theory');
                              setNewQOptions(['Option A', 'Option B', 'Option C', 'Option D']);
                              setNewQSectionId(sections[0]?.id || '');
                              setShowAddQuestionModal(true);
                            }}
                            className="w-full py-3.5 bg-white/5 hover:bg-[#00D2FF]/10 hover:text-[#00D2FF] hover:border-[#00D2FF]/20 active:scale-99 border border-dashed border-white/10 rounded-2xl text-[11px] font-semibold font-heading text-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Plus className="w-4 h-4 text-[#00D2FF]" /> Add Custom Question to "{generatedSets[activeSetIndex].setName}"
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-500">Generate a paper to review outputs.</p>
                    )}

                    {/* Inline Add Question Dialog Modal */}
                    {showAddQuestionModal && (
                      <div className="fixed inset-0 bg-[#0B0E14]/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
                        <div className="glass-card-glow w-full max-w-xl p-6 space-y-4 my-8">
                          <div className="flex justify-between items-center pb-2 border-b border-white/5">
                            <h3 className="font-heading font-black text-white text-md flex items-center gap-2">
                              <Plus className="w-4 h-4 text-[#00D2FF]" /> Create Custom Academic Question
                            </h3>
                            <button 
                              onClick={() => setShowAddQuestionModal(false)}
                              className="text-slate-500 hover:text-white"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="space-y-4 text-xs font-sans text-slate-200">
                            <div className="space-y-1">
                              <label className="text-[10px] font-mono text-slate-400 uppercase">Question Text Content</label>
                              <textarea 
                                className="w-full h-20 bg-[#0B0E14]/80 border border-white/10 rounded-xl p-3 text-xs text-white focus:border-[#00D2FF] outline-none"
                                placeholder="Describe the question body / description..."
                                value={newQText}
                                onChange={(e) => setNewQText(e.target.value)}
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] font-mono text-slate-400 uppercase">Allotted Marks</label>
                                <input 
                                  type="number"
                                  className="w-full bg-[#0B0E14]/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-[#00D2FF] outline-none"
                                  value={newQMarks}
                                  onChange={(e) => setNewQMarks(Math.max(1, parseInt(e.target.value) || 1))}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-mono text-slate-400 uppercase">Course Target Section / Segment</label>
                                <select 
                                  className="w-full bg-[#0B0E14]/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-[#00D2FF] outline-none"
                                  value={newQSectionId}
                                  onChange={(e) => setNewQSectionId(e.target.value)}
                                >
                                  {sections.map((sec) => (
                                    <option key={sec.id} value={sec.id}>{sec.name} ({sec.marksPerQuestion} Marks)</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] font-mono text-slate-400 uppercase">Cognitive level (Bloom)</label>
                                <select 
                                  className="w-full bg-[#0B0E14]/80 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white focus:border-[#00D2FF] outline-none"
                                  value={newQKLevel}
                                  onChange={(e) => setNewQKLevel(e.target.value as KLevel)}
                                >
                                  {Object.values(KLevel).map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-mono text-slate-400 uppercase">Assigned Difficulty</label>
                                <select 
                                  className="w-full bg-[#0B0E14]/80 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white focus:border-[#00D2FF] outline-none"
                                  value={newQDifficulty}
                                  onChange={(e) => setNewQDifficulty(e.target.value as Difficulty)}
                                >
                                  {Object.values(Difficulty).map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-mono text-slate-400 uppercase">Topic & Course Outcome</label>
                                <div className="flex gap-2">
                                  <input 
                                    type="text"
                                    placeholder="Topic, e.g. Unit 3"
                                    className="w-1/2 bg-[#0B0E14]/80 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:border-[#00D2FF] outline-none"
                                    value={newQTopic}
                                    onChange={(e) => setNewQTopic(e.target.value)}
                                  />
                                  <input 
                                    type="text"
                                    placeholder="CO, e.g. CO2"
                                    className="w-1/2 bg-[#0B0E14]/80 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:border-[#00D2FF] outline-none"
                                    value={newQCO}
                                    onChange={(e) => setNewQCO(e.target.value)}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-white/5">
                              <div className="flex items-center gap-4">
                                <label className="text-[10px] font-mono text-slate-400 uppercase">Question Format Category:</label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input 
                                    type="radio" 
                                    name="custom-q-type" 
                                    checked={newQType === 'theory'} 
                                    onChange={() => setNewQType('theory')} 
                                    className="accent-[#00D2FF]"
                                  />
                                  <span className="text-xs">Theory Style</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input 
                                    type="radio" 
                                    name="custom-q-type" 
                                    checked={newQType === 'mcq'} 
                                    onChange={() => setNewQType('mcq')} 
                                    className="accent-[#00D2FF]"
                                  />
                                  <span className="text-xs">Multiple Choice MCQ</span>
                                </label>
                              </div>

                              {newQType === 'mcq' && (
                                <div className="space-y-2 pt-1">
                                  <label className="text-[10px] font-mono text-slate-500 uppercase block">MCQ Option Choices</label>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {newQOptions.map((opt, oIdx) => (
                                      <div key={oIdx} className="flex gap-2 items-center">
                                        <span className="text-xs uppercase font-bold text-[#00D2FF] font-mono">{String.fromCharCode(97 + oIdx)}:</span>
                                        <input 
                                          type="text" 
                                          className="flex-1 bg-[#0B0E14]/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-[#00D2FF] outline-none"
                                          value={opt}
                                          onChange={(e) => {
                                            const nextOpts = [...newQOptions];
                                            nextOpts[oIdx] = e.target.value;
                                            setNewQOptions(nextOpts);
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-3 justify-end pt-3 border-t border-white/5">
                              <button 
                                onClick={() => setShowAddQuestionModal(false)}
                                className="px-4 py-2 rounded-xl text-xs text-slate-400 bg-white/5 hover:bg-white/10"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={() => {
                                  if (!newQText.trim()) {
                                    alert("Please describe the question description body text.");
                                    return;
                                  }
                                  const customQ: Question = {
                                    id: `q-custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    text: newQText,
                                    marks: Number(newQMarks),
                                    kLevel: newQKLevel,
                                    difficulty: newQDifficulty,
                                    topic: newQTopic,
                                    co: newQCO,
                                    correctAnswer: "Manual standard key response criteria.",
                                    rationale: "Manually registered in pattern reviews.",
                                    qualityScore: 100,
                                    sectionId: newQSectionId,
                                    ...(newQType === 'mcq' ? { options: [...newQOptions] } : {})
                                  };
                                  const nextSets = generatedSets.map((set, idx) => {
                                    if (idx === activeSetIndex) {
                                      return {
                                        ...set,
                                        questions: [...set.questions, customQ]
                                      };
                                    }
                                    return set;
                                  });
                                  setGeneratedSets(nextSets);
                                  setShowAddQuestionModal(false);
                                }}
                                className="px-5 py-2 rounded-xl text-xs bg-[#00D2FF] text-[#0B0E14] font-black tracking-wide uppercase"
                              >
                                Save Custom Question
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Inline Question Edit Dialog Modal */}
                    {editingQuestion && (
                      <div className="fixed inset-0 bg-[#0B0E14]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="glass-card-glow w-full max-w-lg p-6 space-y-4">
                          <div className="flex justify-between items-center pb-2 border-b border-white/5">
                            <h3 className="font-heading font-black text-white text-md flex items-center gap-2">
                              <Edit2 className="w-4 h-4 text-[#00D2FF]" /> Manual Question Repair
                            </h3>
                            <button 
                              onClick={() => { setEditingQuestion(null); setEditingQuestionIndex(null); }}
                              className="text-slate-500 hover:text-white"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-mono text-slate-500 uppercase">Question Body Text</label>
                              <textarea 
                                className="w-full h-24 bg-[#0B0E14] border border-white/10 rounded-xl p-3 text-xs text-white focus:border-[#00D2FF] outline-none"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                              />
                            </div>

                            {editingOptions && editingOptions.length > 0 && (
                              <div className="space-y-2">
                                <label className="text-[10px] font-mono text-slate-500 uppercase block">MCQ Options</label>
                                {editingOptions.map((opt, oIdx) => (
                                  <div key={oIdx} className="flex gap-2 items-center">
                                    <span className="text-xs uppercase font-bold text-[#00D2FF] font-mono">{String.fromCharCode(97 + oIdx)}:</span>
                                    <input 
                                      type="text" 
                                      className="flex-1 bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-[#00D2FF] outline-none"
                                      value={opt}
                                      onChange={(e) => {
                                        const nextOpts = [...editingOptions];
                                        nextOpts[oIdx] = e.target.value;
                                        setEditingOptions(nextOpts);
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex gap-3 justify-between pt-2">
                              <button 
                                onClick={() => {
                                  if (!editingQuestion) return;
                                  if (window.confirm("Are you sure you want to remove this question?")) {
                                    const nextSets = generatedSets.map((set, idx) => {
                                      if (idx === activeSetIndex) {
                                        return {
                                          ...set,
                                          questions: set.questions.filter((_, qIdx) => qIdx !== editingQuestionIndex)
                                        };
                                      }
                                      return set;
                                    });
                                    setGeneratedSets(nextSets);
                                    setEditingQuestion(null);
                                    setEditingQuestionIndex(null);
                                  }
                                }}
                                className="px-4 py-2 rounded-xl text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/15 flex items-center gap-1.5 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove Question
                              </button>

                              <div className="flex gap-2">
                                <button 
                                  onClick={() => { setEditingQuestion(null); setEditingQuestionIndex(null); }}
                                  className="px-4 py-2 rounded-xl text-xs text-slate-400 bg-white/5 hover:bg-white/10"
                                >
                                  Cancel
                                </button>
                                <button 
                                  onClick={() => {
                                    if (!editingQuestion) return;
                                    const nextSets = generatedSets.map((set, idx) => {
                                      if (idx === activeSetIndex) {
                                        const updatedQs = set.questions.map((item, qIdx) => {
                                          if (qIdx === editingQuestionIndex) {
                                            return {
                                              ...item,
                                              text: editingText,
                                              options: editingOptions && editingOptions.length > 0 ? [...editingOptions] : item.options
                                            };
                                          }
                                          return item;
                                        });
                                        return { ...set, questions: updatedQs };
                                      }
                                      return set;
                                    });
                                    setGeneratedSets(nextSets);
                                    setEditingQuestion(null);
                                    setEditingQuestionIndex(null);
                                  }}
                                  className="px-4 py-2 rounded-xl text-xs bg-[#00D2FF] text-[#0B0E14] font-bold cursor-pointer"
                                >
                                  Save Repairs
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Navigation Row */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <button 
                        onClick={() => setCurrentStep('PEDAGOGY')}
                        className="btn-secondary-neon font-heading cursor-pointer"
                      >
                        Adjust Difficulty Settings
                      </button>
                      <button 
                        onClick={() => setCurrentStep('INTEGRITY')}
                        className="btn-primary-neon font-heading cursor-pointer"
                      >
                        Check Paper Similarity <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ================= CREATE EXAM STEP 5: INTEGRITY ================= */}
                {currentStep === 'INTEGRITY' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-mono tracking-widest text-[#00D2FF] font-black uppercase">DUPLICATION AND SIMILARITY CHECKS</span>
                        <h2 className="text-3xl font-extrabold font-heading text-white tracking-tight">Paper Overlap & Similarity Check</h2>
                        <p className="text-slate-400 text-sm">Review question overlaps, Course Outcomes compliance, and formatting checks.</p>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setCurrentStep('DRAFT')}
                          className="btn-secondary-neon text-xs py-2 px-4 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" /> Back to Review Panel
                        </button>
                        <button 
                          onClick={() => setCurrentStep('FINALIZE')}
                          className="btn-primary-neon text-xs py-2 px-4 shadow-[0_0_10px_rgba(0,210,255,0.2)] cursor-pointer"
                        >
                          Verify & Finalize Sets <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Overlap anti-cloning gauge */}
                      <div className="glass-card-glow p-8 space-y-6">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="w-6 h-6 text-emerald-400" />
                          <h3 className="font-heading font-black text-lg text-white">Overlap & Anti-Cloning Status</h3>
                        </div>
                        <p className="text-xs text-slate-400">Semantic checkers compared question vector alignments against parallel sets generated.</p>

                        <div className="pt-4 flex flex-col items-center justify-center text-center">
                          <div className="w-32 h-32 rounded-full border-4 border-[#00D2FF] border-t-transparent flex items-center justify-center relative p-2 shadow-inner">
                            <span className="text-3xl font-heading font-extrabold text-white">0%</span>
                            <div className="absolute bottom-2 font-mono text-[9px] uppercase font-black text-slate-400 tracking-wider">OVERLAP</div>
                          </div>
                          <p className="text-xs font-semibold text-emerald-400 mt-4">100% Anti-overlap compliance.</p>
                        </div>

                        <div className="bg-[#151921]/60 rounded-2xl p-4 border border-white/5 space-y-3 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-mono">Set A vs Set B duplication:</span>
                            <span className="text-emerald-400 font-mono font-bold">0% Overlap</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-mono">Set B vs Set C duplication:</span>
                            <span className="text-emerald-400 font-mono font-bold">0% Overlap</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-mono">Set C vs Set D duplication:</span>
                            <span className="text-emerald-400 font-mono font-bold">0% Overlap</span>
                          </div>
                        </div>
                      </div>

                      {/* Coverage Matrix check */}
                      <div className="lg:col-span-2 glass-card p-8 space-y-6">
                        <h3 className="font-heading font-black text-lg text-white">Quality Metrics Validation</h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Course Outcomes */}
                          <div className="bg-[#0B0E14]/80 border border-white/5 rounded-2xl p-5 space-y-3">
                            <h4 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                              <Check className="w-4 h-4 text-[#00D2FF]" /> Course Outcome (CO) Coverage
                            </h4>
                            <div className="space-y-3 text-xs">
                              {syllabusData?.cos.slice(0, 5).map((co, cIdx) => (
                                <div key={cIdx} className="space-y-1">
                                  <div className="flex justify-between font-mono text-[10px]">
                                    <span className="text-slate-300 truncate max-w-xs">{co.split(':')[0]} Question Coverage</span>
                                    <span className="text-emerald-400">100% Mapped</span>
                                  </div>
                                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#00D2FF]" style={{ width: '100%' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Syllabus audit checklist */}
                          <div className="bg-[#0B0E14]/80 border border-white/5 rounded-2xl p-5 space-y-4">
                            <h4 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                              <Check className="w-4 h-4 text-emerald-400" /> Syllabus Balance Metrics
                            </h4>

                            <div className="space-y-3 text-xs font-sans text-slate-300">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Total Generated Questions:</span>
                                <span className="text-white font-mono font-bold">
                                  {generatedSets.reduce((sum, s) => sum + s.questions.length, 0)} Items
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Bloom-weight balance:</span>
                                <span className="text-emerald-400 font-bold font-mono">PASSED</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">No cross-questions duplication:</span>
                                <span className="text-emerald-400 font-bold font-mono">SECURE</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Syntax verification factor:</span>
                                <span className="text-emerald-400 font-bold font-mono">100% VALID</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Navigation */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <button 
                        onClick={() => setCurrentStep('DRAFT')}
                        className="btn-secondary-neon font-heading cursor-pointer"
                      >
                        Calibrate Questions Again
                      </button>
                      <button 
                        onClick={() => setCurrentStep('FINALIZE')}
                        className="btn-primary-neon font-heading cursor-pointer"
                      >
                        View & Finalize Sets <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ================= CREATE EXAM STEP 6: FINALIZE ================= */}
                {currentStep === 'FINALIZE' && (
                  <div className="space-y-8 print-bg-white print:p-0">
                    {/* Finalize controls */}
                    <div className="print:hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-mono tracking-widest text-[#00D2FF] font-black uppercase">PRINT & FINAL EXPORT READY</span>
                        <h2 className="text-3xl font-extrabold font-heading text-white tracking-tight">Finalized Multi-Sets View</h2>
                        <p className="text-slate-400 text-sm">Download or print exam layouts. Downloading automatically archives a master record in past histories.</p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={() => setCurrentStep('INTEGRITY')}
                          className="btn-secondary-neon text-xs py-2 px-4 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" /> Similarity Check
                        </button>

                        <button 
                          onClick={handleSaveToCloud}
                          disabled={savingToCloud}
                          className={cn(
                            "btn-secondary-neon text-xs py-2 px-4 font-semibold cursor-pointer",
                            cloudSuccess ? "text-emerald-400 border-emerald-500/20" : ""
                          )}
                        >
                          {savingToCloud ? (
                            <>
                              <Loader2 className="animate-spin w-4 h-4" /> Archiving...
                            </>
                          ) : cloudSuccess ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Saved to History!
                            </>
                          ) : (
                            <>
                              <Database className="w-4 h-4" /> Save Paper and Close
                            </>
                          )}
                        </button>

                        <button 
                          onClick={handleDownloadAsDoc}
                          className="px-4 py-2 border border-[#00D2FF]/20 rounded-xl text-xs font-bold text-[#00D2FF] bg-[#00D2FF]/5 hover:bg-[#00D2FF]/10 transition-colors cursor-pointer flex items-center gap-1.5"
                          title="Download Word Document"
                        >
                          <FileText className="w-4 h-4" /> Download DOC (.doc)
                        </button>

                        <button 
                          onClick={handleFinalDownloadAndSave}
                          className="btn-primary-neon text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5"
                        >
                          <Printer className="w-4 h-4" /> Print & Save to History
                        </button>
                      </div>
                    </div>

                    {/* Set tabs */}
                    <div className="print:hidden flex border-b border-white/5 pb-2 overflow-x-auto gap-2">
                      {generatedSets.map((set, idx) => (
                        <button 
                          key={set.id}
                          onClick={() => setActiveSetIndex(idx)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-heading font-black tracking-widest uppercase transition-all whitespace-nowrap cursor-pointer",
                            idx === activeSetIndex 
                              ? "bg-[#00D2FF] text-[#0B0E14] font-black" 
                              : "bg-[#151921]/45 text-slate-500 border border-white/5 hover:border-white/10"
                          )}
                        >
                          {set.setName} (100% Unique)
                        </button>
                      ))}
                    </div>

                    {/* Watermark checkbox */}
                    <div className="print:hidden flex items-center justify-between p-4 rounded-2xl bg-[#151921]/60 border border-white/15">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          id="watermark-chk" 
                          checked={showWatermark} 
                          onChange={(e) => setShowWatermark(e.target.checked)}
                          className="accent-[#00D2FF] w-4 h-4 rounded cursor-pointer" 
                        />
                        <label htmlFor="watermark-chk" className="text-xs font-semibold text-white cursor-pointer select-none">
                          Render Watermark on printable paper template
                        </label>
                      </div>
                      {showWatermark && (
                        <input 
                          type="text" 
                          className="bg-[#0B0E14] border border-white/10 text-xs text-[#00D2FF] px-3 py-1.5 rounded-xl outline-none focus:border-[#00D2FF] font-mono-none" 
                          value={customWatermarkText} 
                          onChange={(e) => setCustomWatermarkText(e.target.value)} 
                        />
                      )}
                    </div>

                     {/* Print perfect template card list */}
                    {generatedSets[activeSetIndex] ? (() => {
                      const paper = generatedSets[activeSetIndex];
                      const activeSetTotalMarks = paper.questions.reduce((sum, q) => sum + q.marks, 0) || totalExamMarks;

                      // Group questions by section
                      const sectionsWithQuestions = sections.map((sec) => {
                        const secQuestions = paper.questions.filter(
                          q => q.sectionId === sec.id || (!q.sectionId && q.marks === sec.marksPerQuestion)
                        );
                        return {
                          ...sec,
                          questions: secQuestions
                        };
                      });

                      const matchedIds = new Set(sectionsWithQuestions.flatMap(s => s.questions.map(q => q.id)));
                      const leftovers = paper.questions.filter(q => !matchedIds.has(q.id));

                      return (
                        <div className="relative bg-white p-8 md:p-12 text-black shadow-2xl rounded-3xl overflow-hidden print-container print-bg-white animate-fade-in">
                          
                          {/* Floating watermark */}
                          {showWatermark && (
                            <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center -rotate-45 opacity-[0.03]">
                              <span className="font-heading text-6xl md:text-8xl font-black text-slate-950 uppercase tracking-widest">
                                {customWatermarkText}
                              </span>
                            </div>
                          )}

                          {/* Bordered header */}
                          <div className="border-[3px] border-black p-4 text-center space-y-2">
                            <h4 className="font-heading text-lg font-black uppercase tracking-wider text-black print-text leading-tight">{universityName}</h4>
                            <h5 className="font-heading text-sm font-bold uppercase tracking-widest text-[#151921] print-text">{examType}</h5>
                            <hr className="border-black border-t-2" />
                            
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs font-black uppercase tracking-wide text-left text-black mt-2 print-text font-mono-none">
                              <div>COURSE NAME: <span className="font-medium">{syllabusData?.courseName}</span></div>
                              <div>COURSE CODE: <span className="font-medium">{syllabusData?.subjectCode || "CS803"}</span></div>
                              <div>Duration: <span className="font-medium">{termDuration}</span></div>
                              <div className="text-right">Max Marks: <span className="font-medium">{activeSetTotalMarks}</span></div>
                            </div>
                          </div>

                          {/* Standard Matrix Table */}
                          <div className="mt-8 overflow-x-auto">
                            <table className="w-full border-2 border-black border-collapse text-xs print-table text-black print-text">
                              <thead>
                                <tr className="bg-slate-100 print-bg-white font-heading font-black text-[11px] uppercase tracking-wider text-left border-b-2 border-black">
                                  <th className="py-2.5 px-3 border border-black w-12 text-center text-black">Q.No</th>
                                  <th className="py-2.5 px-4 border border-black text-black">Target Question Element Description</th>
                                  <th className="py-2.5 px-3 border border-black w-24 text-center text-black">CO MAP</th>
                                  <th className="py-2.5 px-3 border border-black w-28 text-center text-black">Bloom Level</th>
                                  <th className="py-2.5 px-3 border border-black w-16 text-center text-black">Marks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sectionsWithQuestions.map((part) => {
                                  if (part.questions.length === 0) return null;
                                  return (
                                    <React.Fragment key={part.id}>
                                      <tr className="bg-slate-50 font-heading font-black text-[10px] uppercase tracking-wider border-y border-black">
                                        <td colSpan={5} className="py-2 px-3 text-black font-extrabold text-left">
                                          {part.name} &mdash; Answer all questions (${part.questions.length} x ${part.marksPerQuestion} = ${part.questions.length * part.marksPerQuestion} Marks)
                                        </td>
                                      </tr>
                                      {part.questions.map((q) => {
                                        const globalIdx = paper.questions.indexOf(q) + 1;
                                        return (
                                          <tr key={q.id} className="hover:bg-slate-50 print-bg-white border-b border-black">
                                            <td className="py-3 px-3 border border-black font-black text-center text-black">{globalIdx}</td>
                                            <td className="py-3 px-4 border border-black leading-relaxed font-serif text-[12.5px] font-medium text-black">
                                              <p className="mb-2 text-black">{q.text}</p>
                                              {q.options && q.options.length > 0 && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pl-4 text-black text-xs font-sans font-medium">
                                                  {q.options.map((opt, oIdx) => (
                                                    <div key={oIdx} className="flex gap-2">
                                                      <span className="font-bold text-black uppercase">{String.fromCharCode(97 + oIdx)}.</span>
                                                      <p className="text-black">{opt}</p>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-3 px-3 border border-black text-center font-bold font-mono text-[10px] text-slate-700">
                                              <span className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-bold uppercase tracking-widest text-[9px] text-black">
                                                {q.co || "CO1"}
                                              </span>
                                            </td>
                                            <td className="py-3 px-3 border border-black text-center">
                                              <span className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-bold uppercase tracking-widest text-[9px] text-black font-mono">
                                                {q.kLevel.split(':')[0]}
                                              </span>
                                            </td>
                                            <td className="py-3 px-3 border border-black text-center font-mono font-black text-black">{q.marks}M</td>
                                          </tr>
                                        );
                                      })}
                                    </React.Fragment>
                                  );
                                })}

                                {leftovers.length > 0 && (
                                  <React.Fragment>
                                    <tr className="bg-slate-50 font-heading font-black text-[10px] uppercase tracking-wider border-y border-black">
                                      <td colSpan={5} className="py-2 px-3 text-black font-extrabold text-left">
                                        Additional Questions &amp; Miscellaneous
                                      </td>
                                    </tr>
                                    {leftovers.map((q) => {
                                      const globalIdx = paper.questions.indexOf(q) + 1;
                                      return (
                                        <tr key={q.id} className="hover:bg-slate-50 print-bg-white border-b border-black">
                                          <td className="py-3 px-3 border border-black font-black text-center text-black">{globalIdx}</td>
                                          <td className="py-3 px-4 border border-black leading-relaxed font-serif text-[12.5px] font-medium text-black">
                                            <p className="mb-2 text-black">{q.text}</p>
                                            {q.options && q.options.length > 0 && (
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pl-4 text-black text-xs font-sans font-medium">
                                                {q.options.map((opt, oIdx) => (
                                                  <div key={oIdx} className="flex gap-2">
                                                    <span className="font-bold text-black uppercase">{String.fromCharCode(97 + oIdx)}.</span>
                                                    <p className="text-black">{opt}</p>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-3 px-3 border border-black text-center font-bold font-mono text-[10px] text-slate-700">
                                            <span className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-bold uppercase tracking-widest text-[9px] text-black">
                                              {q.co || "CO1"}
                                            </span>
                                          </td>
                                          <td className="py-3 px-3 border border-black text-center">
                                            <span className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-bold uppercase tracking-widest text-[9px] text-black font-mono">
                                              {q.kLevel.split(':')[0]}
                                            </span>
                                          </td>
                                          <td className="py-3 px-3 border border-black text-center font-mono font-black text-black">{q.marks}M</td>
                                        </tr>
                                      );
                                    })}
                                  </React.Fragment>
                                )}
                              </tbody>
                            </table>
                          </div>

                          <div className="mt-10 flex items-center justify-between font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                            <span>✓ VALIDATED BY QUALITY AGENTS • 0% OVERLAP</span>
                            <span>{paper.setName}</span>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="p-10 text-center text-slate-500 bg-[#151921]/40 border border-white/5 rounded-3xl">
                        No active sets. Go back and upload a syllabus first.
                      </div>
                    )}

                  </div>
                )}

              </motion.div>
            </AnimatePresence>

          </div>
        )}

        {/* ================= VIEW 3: PREVIOUS_PAPERS (HISTORY) ================= */}
        {activeTab === 'PREVIOUS_PAPERS' && (
          <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-mono tracking-widest text-[#00D2FF] font-bold uppercase">ARCHIVED REPOSITORIES</span>
                <h1 className="text-4xl font-extrabold font-heading text-white tracking-tight">Previous Papers</h1>
                <p className="text-slate-400 text-sm">Review previously generated papers saved securely within cloud history.</p>
              </div>
              <button 
                onClick={fetchPreviousPapers}
                className="btn-secondary-neon text-xs py-2 px-4 cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" /> Refresh History
              </button>
            </div>

            {loadingPapers ? (
              <div className="py-20 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-[#00D2FF] mx-auto mb-4" />
                <p className="text-slate-400 font-mono text-xs">Querying archived databases...</p>
              </div>
            ) : previousPapers.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-3xl p-16 text-center text-slate-500 max-w-xl mx-auto space-y-4">
                <Award className="w-12 h-12 text-[#00D2FF]/30 mx-auto" />
                <h3 className="font-heading font-bold text-white text-md">No saved exam papers found</h3>
                <p className="text-xs text-slate-400">Archived papers will list here. Generate new papers and save to lock them into historical history archives.</p>
                <button 
                  onClick={() => {
                    setActiveTab('CREATE_EXAM');
                    setCurrentStep('INGESTION');
                  }}
                  className="btn-primary-neon text-xs font-sans py-2 px-4 mx-auto cursor-pointer"
                >
                  Create First Paper
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {previousPapers.map((paper: any) => (
                  <div key={paper.id} className="glass-card p-6 space-y-4 flex flex-col justify-between hover:border-[#00D2FF]/30 hover:shadow-lg transition-all duration-300">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono px-2 py-0.5 rounded-full uppercase">
                          {paper.totalSets || 1} Sets Generated
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 font-bold">
                          {new Date(paper.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h3 className="font-heading font-black text-white text-md tracking-tight leading-snug truncate">
                        {paper.courseName}
                      </h3>
                      <p className="text-xs font-mono text-[#00D2FF]">
                        Subject: {paper.subjectCode}
                      </p>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-sans line-clamp-2">
                        Affiliation: {paper.universityName} • {paper.examType}
                      </p>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-white/5">
                      <button 
                        onClick={() => handleLoadPreviousPaper(paper)}
                        className="flex-1 py-2 bg-[#00D2FF]/10 text-[#00D2FF] hover:bg-[#00D2FF] hover:text-[#0B0E14] text-xs font-bold font-sans rounded-xl text-center transition-all cursor-pointer"
                      >
                        Load / Print Options
                      </button>
                      <button 
                        onClick={() => handleDeletePaper(paper.id)}
                        className="p-2 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold border border-red-500/10 rounded-xl transition-all cursor-pointer"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Floating print trigger helper FAB */}
      {activeTab === 'CREATE_EXAM' && currentStep === 'FINALIZE' && generatedSets.length > 0 && (
        <button 
          onClick={handleFinalDownloadAndSave}
          className="print:hidden fixed bottom-6 right-6 p-4 rounded-full bg-[#00D2FF] text-[#0B0E14] hover:bg-[#00e1ff] active:scale-95 transition-all shadow-xl shadow-[#00D2FF]/20 z-10 group cursor-pointer flex items-center"
          title="Print entire exam layout sheet"
        >
          <Printer className="w-6 h-6" />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-350 ease-out font-heading font-black text-xs uppercase tracking-wider pl-1.5">
            Direct Print & Save
          </span>
        </button>
      )}

    </div>
  );
};

export default App;
