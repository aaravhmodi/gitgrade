import { NextRequest, NextResponse } from "next/server";

import type { GitGradeReport } from "@/lib/report-types";
import { getSupabaseConfigStatus, getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const payload = (await request.json()) as GitGradeReport;
  const { data, error } = await supabase
    .from("analysis_reports")
    .insert({
      subject_type: payload.subject_type,
      subject_name: payload.subject_name,
      overall_grade: payload.summary.overall_grade,
      overall_score: payload.summary.overall_score,
      report: payload
    })
    .select("id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, created_at: data.created_at, configured: getSupabaseConfigStatus().configured });
}
