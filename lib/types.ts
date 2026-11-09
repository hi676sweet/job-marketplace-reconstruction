export type Job = {
  id: string; title: string; company: string; initials: string; color: string;
  location: string; workplace: "Remote" | "Hybrid" | "On-site";
  type: "Full-time" | "Contract"; category: string; salaryMin: number; salaryMax: number;
  skills: string[]; description: string; responsibilities: string[]; requirements: string[];
  postedDaysAgo: number;
};
export const STATUSES = ["Submitted", "Reviewing", "Interview", "Offer", "Hired", "Rejected", "Withdrawn"] as const;
export type Status = typeof STATUSES[number];
export type Application = {
  id: string; jobId: string; candidateId: string; name: string; email: string; note: string;
  status: Status; createdAt: string; updatedAt: string;
};
export type Workspace = { jobs: Job[]; savedJobIds: string[]; applications: Application[] };
