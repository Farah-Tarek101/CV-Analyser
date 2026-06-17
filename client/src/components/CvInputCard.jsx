export default function CvInputCard({ file, cvText, onFileChange, onCvTextChange }) {
  return (
    <section className="card panel">
      <h2>1. CV</h2>
      <label className="field">
        <span className="label">Upload PDF or .txt</span>
        <input type="file" accept=".pdf,.txt" onChange={onFileChange} />
      </label>
      {file && (
        <p className="file-hint mono">
          {file.name} ({Math.round(file.size / 1024)} KB)
        </p>
      )}
      <label className="field">
        <span className="label">Or paste CV text</span>
        <textarea
          className="textarea"
          placeholder="Paste your CV as plain text if you prefer not to upload a file"
          value={cvText}
          onChange={(e) => onCvTextChange(e.target.value)}
          rows={8}
        />
      </label>
    </section>
  );
}

