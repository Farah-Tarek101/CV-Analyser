import { useState } from 'react';
import CvInputCard from './components/CvInputCard.jsx';
import JobDescriptionCard from './components/JobDescriptionCard.jsx';
import ResultsCard from './components/ResultsCard.jsx';
import { generatePdfReport } from './utils/pdfReport.js';
import { scoreBand } from './utils/scoreBand.js';
import './App.css';

const initialState = {
  matchScorePercent: null,
  missingKeywords: [],
  matchedKeywords: [],
  missingBySection: null,
  jobMatchQuality: null,
  cvPresentation: null,
  suggestions: [],
  scoreBreakdown: null,
  stats: null,
  error: null,
};

const breakdownRows = [
  { key: 'requiredSkills', label: 'Required skills' },
  { key: 'experienceTools', label: 'Experience/tools' },
  { key: 'niceToHave', label: 'Nice-to-have' },
];

export default function App() {
  const [file, setFile] = useState(null);
  const [cvText, setCvText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(initialState);
  const [showAllMissing, setShowAllMissing] = useState(false);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);

  const analyze = async () => {
    setLoading(true);
    setResult(initialState);
    setShowAllMissing(false);
    try {
      const fd = new FormData();
      fd.append('jobDescription', jobDescription);
      if (file) fd.append('cv', file);
      else if (cvText.trim()) fd.append('cvText', cvText);

      const res = await fetch('/api/analyze', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ...initialState, error: data.error || res.statusText });
        return;
      }
      setResult({
        matchScorePercent: data.matchScorePercent,
        missingKeywords: data.missingKeywords || [],
        matchedKeywords: data.matchedKeywords || [],
        missingBySection: data.missingBySection || null,
        jobMatchQuality: data.jobMatchQuality || null,
        cvPresentation: data.cvPresentation || null,
        suggestions: data.suggestions || [],
        scoreBreakdown: data.scoreBreakdown || null,
        stats: data.stats || null,
        error: null,
      });
    } catch (err) {
      setResult({ ...initialState, error: err.message || 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  const downloadPdfReport = async () => {
    if (result.matchScorePercent == null || isPreparingPdf) return;
    setIsPreparingPdf(true);
    try {
      const scoreInfo = scoreBand(Number(result.matchScorePercent));
      await generatePdfReport({ result, breakdownRows, scoreInfo });
    } finally {
      setIsPreparingPdf(false);
    }
  };

  const canSubmit = jobDescription.trim() && (file || cvText.trim());
  const scoreInfo =
    result.matchScorePercent == null ? null : scoreBand(Number(result.matchScorePercent));
  const displayedMissing = showAllMissing
    ? result.missingKeywords
    : result.missingKeywords.slice(0, 5);
  const hasMoreMissing = result.missingKeywords.length > 5;

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <p className="eyebrow">AI CAREER TOOLKIT</p>
          <span className="status-pill">Live analysis</span>
        </div>
        <h1>CV Analyzer & Job Matcher</h1>
        <p className="tagline">
          Match your CV against a job description in seconds, then focus on the highest-impact
          improvements.
        </p>
        <p className="trust-note">Privacy note: files are processed for analysis and not persisted.</p>
        <div className="stepper" aria-label="Workflow steps">
          <span className="step-chip">1. Add CV</span>
          <span className="step-chip">2. Paste job description</span>
          <span className="step-chip">3. Review score and gaps</span>
        </div>
      </header>

      <main className="layout">
        <CvInputCard
          file={file}
          cvText={cvText}
          onFileChange={(e) => setFile(e.target.files?.[0] || null)}
          onCvTextChange={setCvText}
        />
        <JobDescriptionCard
          jobDescription={jobDescription}
          onJobDescriptionChange={setJobDescription}
          onAnalyze={analyze}
          canSubmit={canSubmit}
          loading={loading}
          error={result.error}
        />
        <ResultsCard
          result={result}
          loading={loading}
          scoreInfo={scoreInfo}
          breakdownRows={breakdownRows}
          displayedMissing={displayedMissing}
          hasMoreMissing={hasMoreMissing}
          showAllMissing={showAllMissing}
          onToggleMissing={() => setShowAllMissing((v) => !v)}
          onDownloadPdf={downloadPdfReport}
          isPreparingPdf={isPreparingPdf}
        />
      </main>
    </div>
  );
}
