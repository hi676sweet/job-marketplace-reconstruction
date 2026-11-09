"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import type { Application, Job, Status, Workspace } from "@/lib/types";

type IconName = "search" | "pin" | "arrow" | "bookmark" | "close" | "check" | "briefcase" | "sliders";
function Icon({ name, size = 18, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4z"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, check: <path d="m5 12 4 4L19 6"/>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12c5 4 13 4 18 0M12 12v5"/></>,
    sliders: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function CompanyLogo({ job, small = false }: { job: Job; small?: boolean }) {
  return <div className={`company-logo ${small ? "small" : ""}`} style={{ background: job.color }} aria-hidden="true">{job.initials}<span>✦</span></div>;
}
function Modal({ children, title, onClose, wide = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? "wide" : ""}`} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button>{children}
  </dialog>;
}
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data as T;
}
const money = (job: Job) => `$${job.salaryMin}k–${job.salaryMax}k`;
const nextStages: Record<Status, Status[]> = { Submitted: ["Reviewing", "Rejected"], Reviewing: ["Interview", "Rejected"], Interview: ["Offer", "Rejected"], Offer: ["Hired", "Rejected"], Hired: [], Rejected: [], Withdrawn: [] };
const date = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
const emptyWorkspace: Workspace = { jobs: [], savedJobIds: [], applications: [] };

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [view, setView] = useState<"Discover" | "Saved" | "Applications">("Discover");
  const [employer, setEmployer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All opportunities");
  const [workplace, setWorkplace] = useState("Any workplace");
  const [type, setType] = useState("Any job type");
  const [location, setLocation] = useState("Anywhere");
  const [sort, setSort] = useState("Newest first");
  const [details, setDetails] = useState<Job | null>(null);
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [pending, setPending] = useState("");
  const [formError, setFormError] = useState("");
  const [note, setNote] = useState("");
  const [employerJob, setEmployerJob] = useState("all");
  const [review, setReview] = useState<Application | null>(null);
  const refresh = useCallback(async () => {
    try { setWorkspace(await request<Workspace>("/api/workspace")); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load the workspace."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    request<Workspace>("/api/workspace").then(
      data => { if (active) { setWorkspace(data); setError(""); } },
      error => { if (active) setError(error instanceof Error ? error.message : "Could not load the workspace."); }
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 4500); return () => clearTimeout(timer); } }, [toast]);
  const ownApplications = workspace.applications.filter(item => item.candidateId === "demo-candidate");
  const jobById = (id: string) => workspace.jobs.find(job => job.id === id)!;
  const applied = (jobId: string) => ownApplications.some(item => item.jobId === jobId);
  const filtered = workspace.jobs.filter(job =>
    (view !== "Saved" || workspace.savedJobIds.includes(job.id)) &&
    (category === "All opportunities" || job.category === category) &&
    (workplace === "Any workplace" || job.workplace === workplace) &&
    (type === "Any job type" || job.type === type) &&
    (location === "Anywhere" || job.location === location) &&
    `${job.title} ${job.company} ${job.skills.join(" ")}`.toLowerCase().includes(query.toLowerCase().trim())
  ).sort((a, b) => sort === "Highest salary" ? b.salaryMax - a.salaryMax : a.postedDaysAgo - b.postedDaysAgo);
  const resetFilters = () => { setQuery(""); setCategory("All opportunities"); setWorkplace("Any workplace"); setType("Any job type"); setLocation("Anywhere"); };
  async function save(job: Job) {
    setPending(`save-${job.id}`);
    try {
      const saved = !workspace.savedJobIds.includes(job.id);
      const data = await request<{ savedJobIds: string[] }>("/api/saved", { method: "PUT", body: JSON.stringify({ jobId: job.id, saved }) });
      setWorkspace(current => ({ ...current, savedJobIds: data.savedJobIds })); setToast(saved ? "Role saved to your shortlist." : "Role removed from your shortlist.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not save this role."); }
    finally { setPending(""); }
  }
  function beginApplication(job: Job) { setDetails(null); setApplyJob(job); setFormError(""); setNote(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("apply"); setFormError("");
    try {
      await request("/api/applications", { method: "POST", body: JSON.stringify({ jobId: applyJob!.id, name: form.get("name"), email: form.get("email"), note: form.get("note") }) });
      await refresh(); setApplyJob(null); setToast("Application sent. Track its progress in Applications.");
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not send the application."); }
    finally { setPending(""); }
  }
  async function changeStage(application: Application, status: Status, actor: "candidate" | "employer") {
    setPending(application.id);
    try {
      await request(`/api/applications/${application.id}`, { method: "PATCH", body: JSON.stringify({ status, actor }) });
      await refresh(); setReview(null); setToast(status === "Withdrawn" ? "Application withdrawn." : `Application moved to ${status.toLowerCase()}.`);
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not update the application."); }
    finally { setPending(""); }
  }
  const activeApplications = workspace.applications.filter(item => employerJob === "all" || item.jobId === employerJob);

  return <>
    <div className="demo-bar"><span className="demo-dot"/>Independent portfolio demo<span className="demo-extra"> · Fictional companies and candidates. Both workspaces are shared and open.</span></div>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="Hireflow home" onClick={() => { setEmployer(false); setView("Discover"); resetFilters(); }}><span className="brand-mark"><i/><i/><i/></span>hireflow<span className="brand-period">.</span></Link>
      <nav aria-label="Candidate navigation" className={employer ? "nav-muted" : ""}>
        {(["Discover", "Saved", "Applications"] as const).map(tab => <button key={tab} className={view === tab && !employer ? "nav-link active" : "nav-link"} onClick={() => { setEmployer(false); setView(tab); }}>
          {tab}{tab !== "Discover" && <span className="nav-count">{tab === "Saved" ? workspace.savedJobIds.length : ownApplications.length}</span>}
        </button>)}
      </nav>
      <div className="header-actions"><button className={`workspace-switch ${employer ? "selected" : ""}`} onClick={() => { setEmployer(!employer); resetFilters(); }}><Icon name="briefcase" size={16}/>{employer ? "Candidate view" : "Employer view"}<Icon name="arrow" size={14}/></button><div className="avatar" title="Shared demo candidate">AM</div></div>
    </div></header>

    <main>
      {!employer && view === "Discover" && <section className="hero content-width">
        <div className="hero-copy"><div className="eyebrow"><span/>YOUR NEXT CHAPTER STARTS HERE</div><h1>Good work.<br/><span>Great possibilities.</span></h1><p>Find a team that sees your potential.<br className="desktop-break"/> Make your next move a meaningful one.</p><div className="hero-proof"><span className="proof-line"/>Thoughtful teams. Real possibilities.</div></div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-star">✳</div><div className="floating-note note-top"><span className="mini-check"><Icon name="check" size={14}/></span>A better kind of Monday.</div><div className="art-card"><div className="art-card-top"><span className="art-logo">o</span><span className="art-tag">IT’S A MATCH</span></div><strong>Your next big thing</strong><span className="art-sub">A team you can grow with.</span><div className="art-card-lines"><span/><span/></div><div className="art-bottom">The future looks good.<span>↗</span></div></div><div className="floating-note note-bottom"><span>✦</span>Room to do your best work.</div></div>
      </section>}

      {employer ? <div className="content-width employer-page">
        <div className="page-title-row"><div><div className="eyebrow dark">EMPLOYER WORKSPACE</div><h1>Your next great teammate.</h1><p>Give every application a thoughtful next step.</p></div><span className="workspace-label"><span className="demo-dot"/>Shared demo workspace</span></div>
        <div className="metrics">{[["Total applications", activeApplications.length], ["In conversation", activeApplications.filter(item => ["Reviewing", "Interview", "Offer"].includes(item.status)).length], ["Open roles", workspace.jobs.length], ["Hired", activeApplications.filter(item => item.status === "Hired").length]].map(([label, count]) => <div className="metric" key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
        <div className="section-heading"><div><h2>Hiring pipeline <span className="small-count">{activeApplications.length}</span></h2><p>Review a candidate to move them through the process.</p></div><label className="select-label"><span className="sr-only">Filter pipeline by role</span><select value={employerJob} onChange={event => setEmployerJob(event.target.value)}><option value="all">All open roles</option>{workspace.jobs.map(job => <option value={job.id} key={job.id}>{job.title} · {job.company}</option>)}</select></label></div>
        {error && <div className="error-panel" role="alert">{error}<button onClick={() => void refresh()}>Try again</button></div>}
        <div className="pipeline">{(["Submitted", "Reviewing", "Interview", "Offer"] as Status[]).map(stage => <section className="pipeline-column" key={stage}><h3><span className={`stage-dot ${stage.toLowerCase()}`}/>{stage}<span>{activeApplications.filter(item => item.status === stage).length}</span></h3><div className="pipeline-cards">{activeApplications.filter(item => item.status === stage).map(application => <button className="candidate-card" onClick={() => setReview(application)} key={application.id}><div className="candidate-card-top"><span className="candidate-avatar">{application.name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><span>↗</span></div><strong>{application.name}</strong><span>{jobById(application.jobId).title}</span><p>{jobById(application.jobId).company}</p><div className="candidate-card-footer"><span>{date(application.createdAt)}</span><span>{application.candidateId.startsWith("sample") ? "Sample candidate" : "Demo candidate"}</span></div></button>)}{!activeApplications.some(item => item.status === stage) && <div className="pipeline-empty">No applications here yet</div>}</div></section>)}</div>
        {activeApplications.some(item => ["Hired", "Rejected", "Withdrawn"].includes(item.status)) && <section className="closed-section"><h2>Closed applications</h2><div className="closed-list">{activeApplications.filter(item => ["Hired", "Rejected", "Withdrawn"].includes(item.status)).map(application => <button key={application.id} onClick={() => setReview(application)}><strong>{application.name}</strong><span>{jobById(application.jobId).title}</span><span className={`status ${application.status.toLowerCase()}`}>{application.status}</span><Icon name="arrow" size={16}/></button>)}</div></section>}
      </div> : <>
        {view !== "Discover" && <div className="content-width page-title-row secondary-title"><div><div className="eyebrow dark">YOUR CAREER, WITH INTENTION</div><h1>{view === "Saved" ? "The ones worth a second look." : "Every next step, in one place."}</h1><p>{view === "Saved" ? "A little shortlist of big possibilities." : "Keep an eye on the opportunities you’ve started."}</p></div><span className="large-icon"><Icon name={view === "Saved" ? "bookmark" : "briefcase"} size={30}/></span></div>}
        {view !== "Applications" ? <div className="content-width opportunities">
          <form className="search-bar" role="search" onSubmit={event => { event.preventDefault(); document.querySelector('.job-results')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }}><label className="search-field"><Icon name="search" size={21}/><input aria-label="Search roles, companies, or skills" placeholder="Job title, company, or keyword" value={query} onChange={event => setQuery(event.target.value)}/></label><label className="location-field"><Icon name="pin" size={20}/><select aria-label="Location" value={location} onChange={event => setLocation(event.target.value)}>{["Anywhere", "Singapore", "Tokyo", "Jakarta"].map(item => <option key={item}>{item}</option>)}</select></label><button type="submit" className="search-hint">Find your fit <Icon name="arrow" size={17}/></button></form>
          <div className="opportunities-layout"><aside className="filters"><div className="filter-heading"><h2><Icon name="sliders" size={17}/>Filters</h2><button onClick={resetFilters}>Reset</button></div>
            <fieldset><legend>Job category</legend>{["All opportunities", "Engineering", "Design", "Product"].map(item => <label className="radio-label" key={item}><input name="category" type="radio" value={item} checked={category === item} onChange={() => setCategory(item)}/>{item}<span>{item === "All opportunities" ? workspace.jobs.length : workspace.jobs.filter(job => job.category === item).length}</span></label>)}</fieldset>
            <fieldset><legend>Workplace</legend>{["Any workplace", "Remote", "Hybrid", "On-site"].map(item => <label className="radio-label" key={item}><input name="workplace" type="radio" value={item} checked={workplace === item} onChange={() => setWorkplace(item)}/>{item}</label>)}</fieldset>
            <fieldset><legend>Job type</legend>{["Any job type", "Full-time", "Contract"].map(item => <label className="radio-label" key={item}><input name="type" type="radio" value={item} checked={type === item} onChange={() => setType(item)}/>{item}</label>)}</fieldset>
            <div className="sidebar-note"><span>✦</span><h3>A good fit goes<br/>both ways.</h3><p>Look for the work you love, and a team that helps you grow.</p></div>
          </aside><section className="job-results" aria-label="Job opportunities"><div className="section-heading"><div><h2>{view === "Saved" ? "Your shortlist" : "Explore opportunities"}<span className="small-count">{filtered.length}</span></h2><p>{view === "Saved" ? "Saved today. A possibility for tomorrow." : "Small teams doing big things. Find your place."}</p></div><label className="sort-label"><span>Sort:</span><select aria-label="Sort opportunities" value={sort} onChange={event => setSort(event.target.value)}><option>Newest first</option><option>Highest salary</option></select></label></div>
            {error && <div className="error-panel" role="alert">{error}<button onClick={() => void refresh()}>Try again</button></div>}
            {loading ? <div className="empty-state"><div className="loading-ring"/><h3>Finding your possibilities…</h3></div> : filtered.length ? <div className="job-grid">{filtered.map(job => <article className="job-card" key={job.id}><div className="job-card-top"><CompanyLogo job={job}/><button className={`icon-button save-button ${workspace.savedJobIds.includes(job.id) ? "is-saved" : ""}`} aria-label={`${workspace.savedJobIds.includes(job.id) ? "Unsave" : "Save"} ${job.title} at ${job.company}`} aria-pressed={workspace.savedJobIds.includes(job.id)} disabled={pending === `save-${job.id}`} onClick={() => void save(job)}><Icon name="bookmark" filled={workspace.savedJobIds.includes(job.id)}/></button></div><p className="company-name">{job.company}<span className="verified" title="Fictional demo company"><Icon name="check" size={10}/></span></p><h3><button onClick={() => setDetails(job)}>{job.title}</button></h3><div className="job-location"><Icon name="pin" size={14}/>{job.location}<span>·</span>{job.workplace}</div><div className="job-tags"><span>{job.type}</span>{job.skills.slice(0, 2).map(skill => <span key={skill}>{skill}</span>)}</div><div className="salary"><strong>{money(job)}</strong><span> USD / year</span></div><div className="job-card-footer"><span>{applied(job.id) ? <span className="applied"><Icon name="check" size={13}/>Applied</span> : `${job.postedDaysAgo}d ago · Demo listing`}</span><button onClick={() => setDetails(job)}>View role<Icon name="arrow" size={15}/></button></div></article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name={view === "Saved" ? "bookmark" : "search"} size={28}/></span><h3>{view === "Saved" && !workspace.savedJobIds.length ? "Your shortlist starts with a little curiosity." : "No roles match these filters."}</h3><p>{view === "Saved" && !workspace.savedJobIds.length ? "Save a role while you explore. It will be waiting here." : "Try a different keyword or open up your search."}</p><button className="button dark-button" onClick={() => { resetFilters(); if (view === "Saved") setView("Discover"); }}>{view === "Saved" ? "Explore opportunities" : "Clear filters"}<Icon name="arrow" size={17}/></button></div>}
            <div className="results-note"><span className="mini-star">✦</span>Good things take a little exploring. You’re in the right place.</div>
          </section></div>
        </div> : <section className="content-width applications-page"><div className="section-heading"><div><h2>Your applications<span className="small-count">{ownApplications.length}</span></h2><p>One thoughtful application is a great start.</p></div></div>{!ownApplications.length ? <div className="empty-state"><span className="empty-icon"><Icon name="briefcase" size={28}/></span><h3>Your next chapter is still unwritten.</h3><p>Apply to a role that catches your eye. Track each step here.</p><button className="button dark-button" onClick={() => setView("Discover")}>Find your opportunity<Icon name="arrow" size={17}/></button></div> : <div className="application-list">{ownApplications.map(application => <article className="application-row" key={application.id}><CompanyLogo job={jobById(application.jobId)} small/><div className="application-job"><h3>{jobById(application.jobId).title}</h3><p>{jobById(application.jobId).company} <span>· Applied {date(application.createdAt)}</span></p></div><span className={`status ${application.status.toLowerCase()}`}>{application.status}</span><button className="text-button" onClick={() => setReview(application)}>View application<Icon name="arrow" size={15}/></button></article>)}</div>}</section>}
      </>}
    </main>
    <footer className="content-width footer"><Link href="/" className="footer-brand" onClick={() => { setEmployer(false); setView("Discover"); resetFilters(); }}>hireflow.</Link><span>Work that moves you forward.</span><span>Original portfolio reconstruction · synthetic data</span></footer>
    <div role="status" aria-live="polite" className={toast ? "toast visible" : "toast"}><Icon name="check" size={16}/>{toast}</div>

    {details && <Modal title={`${details.title} at ${details.company}`} onClose={() => setDetails(null)} wide><div className="detail-heading"><CompanyLogo job={details}/><div><p>{details.company}</p><h2>{details.title}</h2><div className="job-location"><Icon name="pin" size={15}/>{details.location} · {details.workplace} · {details.type}</div></div></div><div className="detail-facts"><div><span>Annual compensation</span><strong>{money(details)} USD</strong></div><div><span>Team</span><strong>{details.category}</strong></div></div><h3>A little about the role</h3><p className="detail-description">{details.description}</p><h3>What you’ll work on</h3><ul className="detail-list">{details.responsibilities.map(item => <li key={item}>{item}</li>)}</ul><h3>What you’ll bring</h3><ul className="detail-list">{details.requirements.map(item => <li key={item}>{item}</li>)}</ul><div className="detail-note">This is a fictional role in an independent portfolio demo. No application is sent to a real company.</div><div className="modal-actions"><button className="button outline-button" disabled={pending === `save-${details.id}`} onClick={() => void save(details)}><Icon name="bookmark" filled={workspace.savedJobIds.includes(details.id)}/>{workspace.savedJobIds.includes(details.id) ? "Saved" : "Save role"}</button><button className="button lime-button" disabled={applied(details.id)} onClick={() => beginApplication(details)}>{applied(details.id) ? "Already applied" : "Apply for this role"}<Icon name="arrow" size={17}/></button></div></Modal>}
    {applyJob && <Modal title="Apply for a role" onClose={() => { if (pending !== "apply") setApplyJob(null); }}><div className="application-modal-intro"><div className="eyebrow dark">MAKE YOUR INTRODUCTION</div><h2>A new possibility starts here.</h2><p>Applying for <strong>{applyJob.title}</strong> at {applyJob.company}.</p></div><div className="form-demo-note">Use fictional details. This shared demo has no private accounts.</div><form onSubmit={submit}><label className="form-field">Full name<input name="name" autoComplete="off" placeholder="Alex Morgan" minLength={2} maxLength={80} required autoFocus/></label><label className="form-field">Email address<input name="email" type="email" autoComplete="off" placeholder="alex@example.com" maxLength={254} required/></label><label className="form-field">A little about you<textarea name="note" placeholder="What excites you about this role? Share a little about your experience and what you’d bring to the team." minLength={30} maxLength={2000} rows={5} required value={note} onChange={event => setNote(event.target.value)}/><span className="field-help">30–2,000 characters<span>{note.length}/2,000</span></span></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="button lime-button full-width" type="submit" disabled={pending === "apply"}>{pending === "apply" ? "Sending application…" : "Send demo application"}<Icon name="arrow" size={17}/></button><p className="form-footnote">Saved locally in the demo workspace. No emails are sent.</p></form></Modal>}
    {review && <Modal title={`Application from ${review.name}`} onClose={() => setReview(null)}><div className="review-heading"><span className="candidate-avatar large">{review.name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><div><h2>{review.name}</h2><p>{review.email}</p></div></div><div className="review-role"><div><span>Applied for</span><strong>{jobById(review.jobId).title}</strong><p>{jobById(review.jobId).company} · {date(review.createdAt)}</p></div><span className={`status ${review.status.toLowerCase()}`}>{review.status}</span></div><h3>Introduction</h3><p className="review-note">{review.note}</p><div className="detail-note">Synthetic candidate data in a shared, open demo workspace.</div>{employer ? <div className="review-actions"><h3>Next step</h3>{nextStages[review.status].length ? <div className="stage-actions">{nextStages[review.status].map(stage => <button className={`button ${stage === "Rejected" ? "outline-button" : "lime-button"}`} key={stage} disabled={pending === review.id} onClick={() => void changeStage(review, stage, "employer")}>{stage === "Rejected" ? "Decline application" : `Move to ${stage.toLowerCase()}`}<Icon name="arrow" size={16}/></button>)}</div> : <p className="muted">This application is closed. Its final stage is preserved.</p>}</div> : !["Hired", "Rejected", "Withdrawn"].includes(review.status) && <button className="button outline-button full-width withdraw-button" disabled={pending === review.id} onClick={() => void changeStage(review, "Withdrawn", "candidate")}>Withdraw application</button>}</Modal>}
  </>;
}
