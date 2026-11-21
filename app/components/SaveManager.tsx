"use client";

import { useRef, useState } from "react";
import { backupSummary, createBackup, MAX_BACKUP_BYTES, parseBackup, RECOVERY_KEY, restoreBackup, SaveBackup } from "../lib/save-backup";

export default function SaveManager() {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<SaveBackup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hasRecovery, setHasRecovery] = useState(false);
  const [current, setCurrent] = useState({ trainers: 0, pokemon: 0, names: [] as string[] });

  function open() {
    setCandidate(null); setConfirmed(false); setMessage(""); setError("");
    try {
      setCurrent(backupSummary(createBackup(localStorage)));
      setHasRecovery(!!localStorage.getItem(RECOVERY_KEY));
    } catch { setError("Browser storage is unavailable or contains damaged data. Downloads may still help recover it."); }
    dialog.current?.showModal();
  }
  function download() {
    try {
      const backup = createBackup(localStorage);
      if (!Object.keys(backup.entries).length) { setMessage("There is no saved game to download yet."); return; }
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `pokerole-save-${backup.createdAt.slice(0, 10)}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError(""); setMessage("Backup download started. Keep the file somewhere safe.");
    } catch { setError("The backup could not be downloaded. Check that browser storage is available."); }
  }
  async function chooseFile(file?: File) {
    setCandidate(null); setConfirmed(false); setError(""); setMessage("");
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("This backup is too large (maximum 5 MB).");
      setCandidate(parseBackup(await file.text()));
    } catch (e) { setError(e instanceof Error ? e.message : "This file could not be read."); }
  }
  function previous() {
    setError(""); setMessage(""); setConfirmed(false); setCandidate(null);
    try { setCandidate(parseBackup(localStorage.getItem(RECOVERY_KEY) ?? "")); }
    catch { setError("The previous save is unavailable or damaged. Choose a downloaded backup instead."); }
  }
  function restore() {
    if (!candidate || !confirmed) return;
    try { restoreBackup(localStorage, candidate); window.location.reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Restore failed. Your save has not been replaced."); }
  }
  const preview = candidate ? backupSummary(candidate) : null;
  return <>
    <button type="button" className="save-trigger" onClick={open}>Save &amp; backup</button>
    <dialog ref={dialog} className="save-dialog" aria-labelledby="save-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className="save-dialog-content">
        <div className="save-dialog-heading">
          <h2 id="save-title">Save &amp; backup</h2>
          <button type="button" aria-label="Close save and backup" onClick={() => dialog.current?.close()}>✕</button>
        </div>
        <p>Your game saves automatically in <strong>this browser on this device</strong>. It does not sync to another device or site address. Clearing browser data removes it.</p>
        <p className="save-summary"><strong>{current.trainers} trainer{current.trainers === 1 ? "" : "s"} · {current.pokemon} Pokémon</strong><br/>{current.names.join(", ") || "Start a game to create your first save."}</p>
        <p>Backups include all trainers, party and PC Pokémon, care progress, and your GM notes and layout. Active battles and queued encounters are not included.</p>
        <button type="button" className="save-primary" onClick={download}>Download backup</button>
        <hr/>
        <h3>Restore a save</h3>
        <p>Choose a backup to review it first. Restoring replaces the saved game in this browser and clears the current battle and queued encounters. Download your current backup and close other open PokeRole tabs before continuing.</p>
        <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Choose a PokeRole backup file" hidden onChange={e => { void chooseFile(e.target.files?.[0]); e.target.value = ""; }}/>
        <div className="save-actions">
          <button type="button" onClick={() => fileInput.current?.click()}>Choose backup file</button>
          {hasRecovery && <button type="button" onClick={previous}>Review previous save</button>}
        </div>
        {candidate && preview && <section className="save-preview" aria-label="Backup preview">
          <h3>Backup ready to review</h3>
          <p>{new Date(candidate.createdAt).toLocaleString()}<br/><strong>{preview.trainers} trainers · {preview.pokemon} Pokémon</strong><br/>{preview.names.join(", ") || "GM workspace only"}</p>
          <label className="save-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>Replace this browser’s save with this backup.</label>
          <p>One previous save is kept in this browser after a successful restore.</p>
          <button type="button" className="save-primary" disabled={!confirmed} onClick={restore}>Restore backup &amp; reload</button>
        </section>}
        {error && <p role="alert" className="save-error">{error}</p>}
        <p role="status" aria-live="polite">{message}</p>
      </div>
    </dialog>
  </>;
}
