import { useState } from 'react';

export default function ResultsCard({
  result,
  loading,
  scoreInfo,
  breakdownRows,
  displayedMissing,
  hasMoreMissing,
  showAllMissing,
  onToggleMissing,
  onDownloadPdf,
  isPreparingPdf,
}) {
  const [showMatchDetails, setShowMatchDetails] = useState(true);
  const [showCvDetails, setShowCvDetails] = useState(true);
  const match = result.jobMatchQuality;
  const cvPresentation = result.cvPresentation;

  return (
    <section className="card results">
      <h2>3. Results</h2>
      {loading && (
        <div className="skeleton-wrap" aria-hidden="true">
          <div className="skeleton line short" />
          <div className="skeleton box" />
          <div className="skeleton line" />
          <div className="skeleton line" />
        </div>
      )}
      {result.matchScorePercent == null && !result.error && (
        <p className="muted">Run an analysis to see match score and gaps.</p>
      )}
      {result.matchScorePercent != null && (
        <>
          {match && (
            <div className="block report-section">
              <div className="row-head">
                <div>
                  <h3>Job Match Quality</h3>
                  <p className="score-big mono">{match.score}/100</p>
                  <span className={`score-badge ${match.score >= 70 ? 'good' : match.score >= 55 ? 'warn' : 'danger'}`}>
                    {match.label}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn ghost compact"
                  onClick={() => setShowMatchDetails((v) => !v)}
                >
                  {showMatchDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>

              {showMatchDetails && (
                <>
                  <h4 className="subhead">Match Score Breakdown</h4>
                  <div className="dimension-grid">
                    {Object.values(match.dimensions || {}).map((d) => (
                      <article key={d.title} className="dimension-card">
                        <h5>{d.title}</h5>
                        <p className="muted small">{d.subtitle}</p>
                        <p className="dim-score mono">{d.score}/100</p>
                        <p className="muted small">{d.description}</p>
                      </article>
                    ))}
                  </div>
                  <div className="block-split">
                    <div>
                      <h4 className="subhead">Strengths</h4>
                      <ul className="suggestions">
                        {(match.strengths || []).map((item, idx) => (
                          <li key={`strength-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="subhead">What Could Hold You Back</h4>
                      <ul className="suggestions">
                        {(match.blockers || []).map((item, idx) => (
                          <li key={`blocker-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {cvPresentation && (
            <div className="block report-section">
              <div className="row-head">
                <div>
                  <h3>CV Presentation</h3>
                  <p className="score-big mono">{cvPresentation.score}/100</p>
                  <span
                    className={`score-badge ${
                      cvPresentation.score >= 70 ? 'good' : cvPresentation.score >= 55 ? 'warn' : 'danger'
                    }`}
                  >
                    {cvPresentation.label}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn ghost compact"
                  onClick={() => setShowCvDetails((v) => !v)}
                >
                  {showCvDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
              {showCvDetails && (
                <>
                  <h4 className="subhead">5D Score Breakdown</h4>
                  <div className="mini-score-list">
                    {Object.entries(cvPresentation.breakdown || {}).map(([k, v]) => (
                      <div className="mini-score-row" key={k}>
                        <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</span>
                        <strong className="mono">{v}/10</strong>
                      </div>
                    ))}
                  </div>
                  <div className="block-split">
                    <div>
                      <h4 className="subhead">Doing Well</h4>
                      <ul className="suggestions">
                        {(cvPresentation.doingWell || []).map((item, idx) => (
                          <li key={`well-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="subhead">To Improve</h4>
                      <ul className="suggestions">
                        {(cvPresentation.toImprove || []).map((item, idx) => (
                          <li key={`improve-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="score-block">
            <span className="score-label">Match score</span>
            <div className="score-value">{result.matchScorePercent}%</div>
            {scoreInfo && <span className={`score-badge ${scoreInfo.tone}`}>{scoreInfo.label}</span>}
            {result.stats && (
              <p className="stats mono">
                CV terms: {result.stats.cvUniqueTermsWithPhrases ?? result.stats.cvUniqueTerms} · Job
                terms: {result.stats.jobUniqueTermsWithPhrases ?? result.stats.jobUniqueTerms}
              </p>
            )}
            <div className="score-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={onDownloadPdf}
                disabled={isPreparingPdf}
              >
                {isPreparingPdf ? 'Preparing PDF...' : 'Download report (PDF)'}
              </button>
            </div>
          </div>
          {result.scoreBreakdown && (
            <div className="block">
              <h3>Weighted breakdown</h3>
              <p className="muted small">
                Overall score combines Required (50%), Experience (30%), and Nice-to-have (20%),
                normalized to available sections.
              </p>
              <div className="breakdown-list">
                {breakdownRows.map((row) => {
                  const score = Number(result.scoreBreakdown[row.key] || 0);
                  const weight = Number(result.scoreBreakdown.weights?.[row.key] || 0);
                  return (
                    <div className="breakdown-row" key={row.key}>
                      <div className="breakdown-head">
                        <span>{row.label}</span>
                        <span className="mono">
                          {score}% · weight {(weight * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="meter">
                        <div
                          className="meter-fill"
                          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="block">
            <h3>Missing keywords</h3>
            <p className="muted small">
              Words that appear in the job text (after cleaning) but not in your CV. Use only what
              honestly applies.
            </p>
            <div className="chips">
              {result.missingKeywords.length === 0 && (
                <span className="muted">None detected at single-word level.</span>
              )}
              {displayedMissing.map((w) => (
                <span key={w} className="chip">
                  {w}
                </span>
              ))}
            </div>
            {hasMoreMissing && (
              <button type="button" className="btn ghost" onClick={onToggleMissing}>
                {showAllMissing ? 'Show top 5 only' : `Show ${result.missingKeywords.length - 5} more`}
              </button>
            )}
          </div>
          <div className="block">
            <h3>Suggestions</h3>
            <ul className="suggestions">
              {result.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

