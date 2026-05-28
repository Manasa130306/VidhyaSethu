-- PostgreSQL Schema for Vidyasethu

-- Sessions Table
CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    course_name VARCHAR(255) NOT NULL,
    subject_code VARCHAR(50) NOT NULL,
    modules JSONB NOT NULL, -- Array of module names
    cos JSONB NOT NULL, -- Array of Course Outcomes (CO1-CO6)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Exam Sets Table
CREATE TABLE exam_sets (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    set_name VARCHAR(50) NOT NULL, -- e.g., 'Set A'
    total_marks INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 180,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Questions Table
CREATE TABLE questions (
    id UUID PRIMARY KEY,
    set_id UUID REFERENCES exam_sets(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    options JSONB, -- Optional for MCQs
    correct_answer TEXT NOT NULL,
    rationale TEXT NOT NULL,
    k_level VARCHAR(50) NOT NULL, -- K1 to K6
    difficulty VARCHAR(20) NOT NULL, -- Easy, Medium, Hard
    topic VARCHAR(255) NOT NULL,
    co VARCHAR(10) NOT NULL, -- CO1 to CO6
    marks INTEGER NOT NULL,
    quality_score INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Question Repository (Global Seen List)
CREATE TABLE repository (
    id UUID PRIMARY KEY,
    text TEXT UNIQUE NOT NULL,
    k_level VARCHAR(50) NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    co VARCHAR(10) NOT NULL,
    marks INTEGER NOT NULL,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
