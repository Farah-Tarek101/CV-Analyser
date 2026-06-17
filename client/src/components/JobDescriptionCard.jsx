export default function JobDescriptionCard({
  jobDescription,
  onJobDescriptionChange,
  onAnalyze,
  canSubmit,
  loading,
  error,
}) {
  return (
    <section className="card panel">
      <h2>2. Job description</h2>
      <label className="field">
        <span className="label">Paste the full job post</span>
        <textarea
          className="textarea"
          placeholder="Responsibilities, requirements, nice-to-haves..."
          value={jobDescription}
          onChange={(e) => onJobDescriptionChange(e.target.value)}
          rows={12}
        />
      </label>
      <button type="button" className="btn primary" disabled={!canSubmit || loading} onClick={onAnalyze}>
        {loading ? 'Analyzing...' : 'Analyze'}
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

