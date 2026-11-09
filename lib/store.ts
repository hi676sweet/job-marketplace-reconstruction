import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { jobs as seedJobs } from "./seed.ts";
import { STATUSES, type Application, type Job, type Status } from "./types.ts";

export const DEMO_CANDIDATE = "demo-candidate";
export class DomainError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const transitions: Record<Status, Status[]> = {
  Submitted: ["Reviewing", "Rejected", "Withdrawn"], Reviewing: ["Interview", "Rejected", "Withdrawn"],
  Interview: ["Offer", "Rejected", "Withdrawn"], Offer: ["Hired", "Rejected", "Withdrawn"],
  Hired: [], Rejected: [], Withdrawn: []
};
export function nextStatuses(status: Status): Status[] { return transitions[status]; }

export class Store {
  db: DatabaseSync;
  constructor(path: string, demoApplications = true) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS saved_jobs (candidate_id TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), PRIMARY KEY(candidate_id, job_id));
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), candidate_id TEXT NOT NULL,
        name TEXT NOT NULL, email TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(job_id, candidate_id));
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    const insertJob = this.db.prepare("INSERT OR IGNORE INTO jobs (id, data) VALUES (?, ?)");
    for (const job of seedJobs) insertJob.run(job.id, JSON.stringify(job));
    if (demoApplications && !this.db.prepare("SELECT value FROM metadata WHERE key='demo-seeded'").get()) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        if (!this.db.prepare("SELECT value FROM metadata WHERE key='demo-seeded'").get()) {
          const names = ["Jamie Chen", "Riley Park", "Taylor Reed", "Sam Rivera", "Robin Lee"];
          const statuses: Status[] = ["Submitted", "Reviewing", "Interview", "Offer", "Submitted"];
          names.forEach((name, i) => {
            const at = new Date(Date.now() - (i + 1) * 86400000).toISOString();
            this.db.prepare("INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
              `sample-${i}`, i === 4 ? "j-04" : "j-01", `sample-candidate-${i}`, name,
              `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
              "I enjoy building thoughtful products with a collaborative team. This is a synthetic sample application for the Hireflow demo.", statuses[i], at, at);
          });
          this.db.prepare("INSERT INTO metadata VALUES ('demo-seeded', '1')").run();
        }
        this.db.exec("COMMIT");
      } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    }
  }
  close() { this.db.close(); }
  jobs(): Job[] { return this.db.prepare("SELECT data FROM jobs ORDER BY id").all().map(row => JSON.parse(String(row.data))); }
  saved(): string[] { return this.db.prepare("SELECT job_id FROM saved_jobs WHERE candidate_id=?").all(DEMO_CANDIDATE).map(row => String(row.job_id)); }
  save(jobId: string, saved: boolean) {
    this.requireJob(jobId);
    if (saved) this.db.prepare("INSERT OR IGNORE INTO saved_jobs VALUES (?, ?)").run(DEMO_CANDIDATE, jobId);
    else this.db.prepare("DELETE FROM saved_jobs WHERE candidate_id=? AND job_id=?").run(DEMO_CANDIDATE, jobId);
    return this.saved();
  }
  applications(): Application[] {
    return this.db.prepare("SELECT id, job_id AS jobId, candidate_id AS candidateId, name, email, note, status, created_at AS createdAt, updated_at AS updatedAt FROM applications ORDER BY created_at DESC, id").all() as Application[];
  }
  private requireJob(id: string) {
    if (!this.db.prepare("SELECT id FROM jobs WHERE id=?").get(id)) throw new DomainError("This role could not be found.", 404);
  }
  apply(payload: unknown): Application {
    if (!payload || typeof payload !== "object") throw new DomainError("Please provide your application details.");
    const data = payload as Record<string, unknown>;
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const note = typeof data.note === "string" ? data.note.trim() : "";
    const jobId = typeof data.jobId === "string" ? data.jobId : "";
    if (name.length < 2 || name.length > 80) throw new DomainError("Use a name between 2 and 80 characters.");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("Enter a valid email address.");
    if (note.length < 30 || note.length > 2000) throw new DomainError("Your introduction must be between 30 and 2,000 characters.");
    this.requireJob(jobId);
    const at = new Date().toISOString();
    const application: Application = { id: randomUUID(), jobId, candidateId: DEMO_CANDIDATE, name, email, note, status: "Submitted", createdAt: at, updatedAt: at };
    try {
      this.db.prepare("INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(application.id, jobId, DEMO_CANDIDATE, name, email, note, "Submitted", at, at);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) throw new DomainError("You have already applied for this role.", 409);
      throw error;
    }
    return application;
  }
  move(id: string, target: unknown, actor: "candidate" | "employer"): Application {
    if (typeof target !== "string" || !STATUSES.includes(target as Status)) throw new DomainError("Choose a valid application stage.");
    const application = this.applications().find(item => item.id === id);
    if (!application) throw new DomainError("This application could not be found.", 404);
    if (actor === "candidate" && (application.candidateId !== DEMO_CANDIDATE || target !== "Withdrawn")) throw new DomainError("Candidates can only withdraw their own applications.", 403);
    if (actor === "employer" && target === "Withdrawn") throw new DomainError("Only a candidate can withdraw an application.", 403);
    if (!transitions[application.status].includes(target as Status)) throw new DomainError(`Cannot move an application from ${application.status} to ${target}.`, 409);
    const at = new Date().toISOString();
    const changed = this.db.prepare("UPDATE applications SET status=?, updated_at=? WHERE id=? AND status=?").run(target, at, id, application.status);
    if (!changed.changes) throw new DomainError("This application changed. Refresh and try again.", 409);
    return { ...application, status: target as Status, updatedAt: at };
  }
}
const globalStore = globalThis as unknown as { hireflowStore?: Store };
export function getStore() {
  if (!globalStore.hireflowStore) globalStore.hireflowStore = new Store(process.env.HIREFLOW_DB_PATH || ".data/hireflow.sqlite");
  return globalStore.hireflowStore;
}
