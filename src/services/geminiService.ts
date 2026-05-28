import { GoogleGenAI, Type } from "@google/genai";
import { Question, KLevel, Difficulty, SyllabusData, ExamSet } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "AIzaSyD1FUQLEUsgOl-2xMwOcfBDZIjrojWLgs8" });

export const geminiService = {
  async extractSyllabus(input: string | File): Promise<SyllabusData> {
    try {
      let prompt = "Extract Course Name, Subject Code, Topics, and Course Outcomes (COs: CO1 to CO6) from this syllabus. If it is plain text, ignore formatting irregularities and extract key topics/units and outcomes cleanly.";
      let contents: any = { parts: [{ text: prompt }] };

      if (typeof input !== "string") {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(input);
        });
        contents.parts.push({
          inlineData: { data: base64, mimeType: input.type }
        });
      } else {
        contents.parts[0].text += `\n\nSyllabus Text:\n${input}`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              courseName: { type: Type.STRING },
              subjectCode: { type: Type.STRING },
              topics: { type: Type.ARRAY, items: { type: Type.STRING } },
              cos: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["courseName", "subjectCode", "topics", "cos"]
          }
        }
      });

      const result = response.text || "{}";
      return JSON.parse(result);
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      throw new Error(error.message || "Failed to extract syllabus.");
    }
  },

  async parsePastPaper(file: File): Promise<any> {
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });

      const prompt = `Analyze this past examination question paper. Extract its organizational metadata (college/university name, exam type, duration) and detailed structural patterns into sections.
      
      Look for and extract:
      1. College / University Name (e.g., 'Vidyasethu National Institute of Technology', 'IIT Bombay') found near the header.
      2. Exam Type / Title / Details (e.g., 'End-Semester Examination', 'Mid-Term Test', 'December 2025 Regular Exam').
      3. Term / Duration of the exam (e.g., '3 Hours', '2 Hours').
      4. List of sections (each having Name like 'Part A', question count, marks per question, type: 'theory' or 'mcq').
      
      Return a JSON object containing universityName, examType, termDuration, and sections.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { text: prompt },
          { inlineData: { data: base64, mimeType: file.type } }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              universityName: { type: Type.STRING },
              examType: { type: Type.STRING },
              termDuration: { type: Type.STRING },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    questionCount: { type: Type.NUMBER },
                    marksPerQuestion: { type: Type.NUMBER },
                    type: { type: Type.STRING, enum: ['theory', 'mcq'] }
                  },
                  required: ["name", "questionCount", "marksPerQuestion", "type"]
                }
              }
            },
            required: ["sections", "universityName", "examType", "termDuration"]
          }
        }
      });

      const result = JSON.parse(response.text || "{\"sections\": [], \"universityName\": \"\", \"examType\": \"\", \"termDuration\": \"\"}");
      return result;
    } catch (error: any) {
      console.error("Gemini Past Paper Parser Error:", error);
      throw new Error(error.message || "Failed to parse past exam paper pattern.");
    }
  },

  async regenerateSingleQuestion(
    syllabus: SyllabusData,
    oldQuestion: Question,
    feedback?: string
  ): Promise<Question> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a Question Calibration Agent.
        Regenerate a single alternative question that replaces the previous one.
        The replacement question MUST target the exact same details:
        - Target Course: ${syllabus.courseName}
        - Topic Context: ${oldQuestion.topic}
        - Course Outcome (CO): ${oldQuestion.co}
        - Cognitive Level (Bloom's): ${oldQuestion.kLevel}
        - Allotted Marks: ${oldQuestion.marks}
        - Difficulty Allotment: ${oldQuestion.difficulty}
        - Original Question: "${oldQuestion.text}"
        ${feedback ? `- Additional User Feedback / Direction: "${feedback}"` : ''}
        ${oldQuestion.options && oldQuestion.options.length > 0 ? '- Must be MCQ style, returning options.' : '- Must be Theory style (no options).'}
        
        Return a single question object in JSON matching the schema.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              correctAnswer: { type: Type.STRING },
              rationale: { type: Type.STRING },
              kLevel: { type: Type.STRING, enum: Object.values(KLevel) },
              difficulty: { type: Type.STRING, enum: Object.values(Difficulty) },
              topic: { type: Type.STRING },
              co: { type: Type.STRING },
              marks: { type: Type.NUMBER },
              options: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["text", "correctAnswer", "rationale", "kLevel", "difficulty", "topic", "co", "marks"]
          }
        }
      });

      const q = JSON.parse(response.text || "{}");
      return {
        ...q,
        id: `q-regen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        qualityScore: 100
      };
    } catch (error: any) {
      console.error("Gemini single question regeneration error:", error);
      throw new Error(error.message || "Failed to regenerate alternative question.");
    }
  },

  async generateMultiSet(
    syllabus: SyllabusData,
    pattern: any,
    difficultyWeight: any,
    kWeight: any,
    setCount: number,
    excludedQuestions: string[] = []
  ): Promise<ExamSet[]> {
    const globalSeenList = new Set<string>(excludedQuestions);

    // Create tasks for all sets and sections
    const generationTasks: Promise<{ setIdx: number; section: any; questions: Question[] }>[] = [];

    for (let i = 0; i < setCount; i++) {
      for (const section of pattern.sections) {
        const task = (async () => {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `You are a Multi-Agent AI System for Automated Examination Design.
            
            Agents: Question Generation, Bloom Taxonomy Validator (K1-K6), Difficulty Estimation, Duplicate Detection, Quality Evaluation.

            Context:
            Course: ${syllabus.courseName} (${syllabus.subjectCode})
            Topics: ${syllabus.topics.join(", ")}
            COs: ${syllabus.cos.join(", ")}
            
            Constraints:
            - Section: ${section.name}
            - Type: ${section.type.toUpperCase()} ${section.type === 'mcq' ? '(Must include 4 options)' : '(Theory question)'}
            - Marks per question: ${section.marksPerQuestion}
            - Count: ${section.questionCount}
            - Difficulty Target: Easy(${difficultyWeight.easy}%), Medium(${difficultyWeight.medium}%), Hard(${difficultyWeight.hard}%)
            - K-Level Target: K1(${kWeight.k1}%), K2(${kWeight.k2}%), K3(${kWeight.k3}%), K4(${kWeight.k4}%), K5(${kWeight.k5}%), K6(${kWeight.k6}%)
            - Global Seen List (DO NOT REPEAT): ${Array.from(globalSeenList).slice(-20).join(" | ")}
            
            Return as JSON array of questions.`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    correctAnswer: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    kLevel: { type: Type.STRING, enum: Object.values(KLevel) },
                    difficulty: { type: Type.STRING, enum: Object.values(Difficulty) },
                    topic: { type: Type.STRING },
                    co: { type: Type.STRING },
                    marks: { type: Type.NUMBER },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["text", "correctAnswer", "rationale", "kLevel", "difficulty", "topic", "co", "marks"]
                }
              }
            }
          });

          const raw = JSON.parse(response.text || "[]");
          const processed = raw.map((q: any, idx: number) => ({
            ...q,
            id: `q-${i}-${section.id}-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            sectionId: section.id,
            qualityScore: 100
          }));
          return { setIdx: i, section, questions: processed };
        })();
        generationTasks.push(task);
      }
    }

    // Execute all AI calls in parallel
    const results = await Promise.all(generationTasks);

    const sets: ExamSet[] = [];
    for (let i = 0; i < setCount; i++) {
      const setName = `Set ${String.fromCharCode(65 + i)}`;
      const setQuestions = results
        .filter(r => r.setIdx === i)
        .flatMap(r => r.questions);

      sets.push({
        id: `set-${i}-${Date.now()}`,
        setName,
        questions: setQuestions,
        totalMarks: setQuestions.reduce((sum, q) => sum + q.marks, 0),
        durationMinutes: 180
      });
    }

    return sets;
  }
};
