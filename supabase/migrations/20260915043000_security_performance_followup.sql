drop policy if exists ai_usage_no_direct_read on public.ai_usage_daily;
create policy ai_usage_no_direct_read on public.ai_usage_daily for select to authenticated using (false);

create index if not exists card_progress_question_id_idx on public.card_progress(question_id);
create index if not exists modules_created_by_idx on public.modules(created_by);
create index if not exists question_reports_module_id_idx on public.question_reports(module_id);
create index if not exists question_reports_user_id_idx on public.question_reports(user_id);
create index if not exists test_sessions_module_id_idx on public.test_sessions(module_id);

drop policy if exists "report insert own" on public.question_reports;
drop policy if exists "report read own" on public.question_reports;
drop policy if exists "report dev read" on public.question_reports;
drop policy if exists "report dev update" on public.question_reports;
create policy "report insert own" on public.question_reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy "report read own" on public.question_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "report dev read" on public.question_reports for select to authenticated using ((select public.is_developer()));
create policy "report dev update" on public.question_reports for update to authenticated using ((select public.is_developer())) with check ((select public.is_developer()));

drop policy if exists "Users can delete own progress" on public.card_progress;
drop policy if exists "Users can insert own progress" on public.card_progress;
drop policy if exists "Users can read own progress" on public.card_progress;
drop policy if exists "Users can update own progress" on public.card_progress;
create policy "Users can delete own progress" on public.card_progress for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own progress" on public.card_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can read own progress" on public.card_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can update own progress" on public.card_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own sessions" on public.test_sessions;
drop policy if exists "Users can read own sessions" on public.test_sessions;
create policy "Users can insert own sessions" on public.test_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can read own sessions" on public.test_sessions for select to authenticated using ((select auth.uid()) = user_id);
