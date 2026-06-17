export type GitGradeReport = {
  subject_type: string;
  subject_name: string;
  summary: {
    overall_grade: string;
    overall_score: number;
    average_commit_score: number;
    meaningful_commit_ratio: number;
    impact_per_commit: number;
    commit_inflation_ratio: number;
    padding_risk: string;
    total_commits: number;
    meaningful_commits: number;
    file_type_breakdown: Record<string, number>;
    commit_label_breakdown: Record<string, number>;
    weak_signal_patterns: string[];
    strongest_signal: string;
    weakest_signal: string;
  };
  commits: Array<{
    sha: string;
    message: string;
    predicted_label: string;
    score: number;
    weighted_impact: number;
    confidence: number;
    rationale: string[];
  }>;
  top_commits: Array<{
    sha: string;
    message: string;
    predicted_label: string;
    score: number;
  }>;
};

export type SavedReportRecord = {
  id: string;
  subject_type: string;
  subject_name: string;
  overall_grade: string;
  overall_score: number;
  report: GitGradeReport;
  created_at: string;
};
