-- Seed the existing Career Direction Assessment with transparent, self-report preference questions.
-- Scores are simple counts of explicit choices; they are not a validated psychometric instrument.
do $$
declare
  v_assessment_id uuid;
begin
  select id into v_assessment_id
  from public.assessments
  where assessment_type = 'career_direction'
    and active = true
  order by created_at
  limit 1;

  if v_assessment_id is null then
    raise exception 'Active career_direction assessment is required before seeding questions';
  end if;

  insert into public.assessment_questions (id, assessment_id, question, question_type, options, position)
  values
    ('da000001-0000-4000-8000-000000000001', v_assessment_id, 'In a project, which task would you most like to take on?', 'single_choice',
      jsonb_build_array(
        jsonb_build_object('value','people_community','label','Facilitate a session and support participants','category','people_community'),
        jsonb_build_object('value','analysis_problem_solving','label','Review information and find patterns','category','analysis_problem_solving'),
        jsonb_build_object('value','communication_storytelling','label','Explain the work through a clear brief or story','category','communication_storytelling'),
        jsonb_build_object('value','building_operations','label','Plan tasks, owners, timelines, and follow-up','category','building_operations')
      ), 1),
    ('da000002-0000-4000-8000-000000000002', v_assessment_id, 'Which kind of challenge would you most enjoy working on?', 'single_choice',
      jsonb_build_array(
        jsonb_build_object('value','people_community','label','Helping a group solve a shared problem','category','people_community'),
        jsonb_build_object('value','analysis_problem_solving','label','Finding out why a process or result is changing','category','analysis_problem_solving'),
        jsonb_build_object('value','communication_storytelling','label','Making a complex idea clear to different audiences','category','communication_storytelling'),
        jsonb_build_object('value','building_operations','label','Turning a plan into reliable, coordinated delivery','category','building_operations')
      ), 2),
    ('da000003-0000-4000-8000-000000000003', v_assessment_id, 'Which contribution would feel most satisfying at the end of a workday?', 'single_choice',
      jsonb_build_array(
        jsonb_build_object('value','people_community','label','Someone received useful support or learned something','category','people_community'),
        jsonb_build_object('value','analysis_problem_solving','label','A decision improved because the evidence was clearer','category','analysis_problem_solving'),
        jsonb_build_object('value','communication_storytelling','label','A message or resource helped people understand an issue','category','communication_storytelling'),
        jsonb_build_object('value','building_operations','label','A service, event, or project moved forward as planned','category','building_operations')
      ), 3),
    ('da000004-0000-4000-8000-000000000004', v_assessment_id, 'When joining a new team, which activity would you volunteer to do first?', 'single_choice',
      jsonb_build_array(
        jsonb_build_object('value','people_community','label','Listen to people and understand what support they need','category','people_community'),
        jsonb_build_object('value','analysis_problem_solving','label','Organize information and identify unanswered questions','category','analysis_problem_solving'),
        jsonb_build_object('value','communication_storytelling','label','Draft an update, presentation, or stakeholder message','category','communication_storytelling'),
        jsonb_build_object('value','building_operations','label','Set up the workplan, responsibilities, and check-ins','category','building_operations')
      ), 4),
    ('da000005-0000-4000-8000-000000000005', v_assessment_id, 'Which output would you prefer to create?', 'single_choice',
      jsonb_build_array(
        jsonb_build_object('value','people_community','label','A useful learning or support activity for a group','category','people_community'),
        jsonb_build_object('value','analysis_problem_solving','label','A short analysis that compares options or explains a trend','category','analysis_problem_solving'),
        jsonb_build_object('value','communication_storytelling','label','A clear article, campaign, guide, or presentation','category','communication_storytelling'),
        jsonb_build_object('value','building_operations','label','A practical process, delivery plan, or working service','category','building_operations')
      ), 5),
    ('da000006-0000-4000-8000-000000000006', v_assessment_id, 'What type of collaboration would you choose for a team assignment?', 'single_choice',
      jsonb_build_array(
        jsonb_build_object('value','people_community','label','Coordinate with participants, partners, or service users','category','people_community'),
        jsonb_build_object('value','analysis_problem_solving','label','Check sources, compare information, and test conclusions','category','analysis_problem_solving'),
        jsonb_build_object('value','communication_storytelling','label','Shape the narrative and tailor how the team communicates','category','communication_storytelling'),
        jsonb_build_object('value','building_operations','label','Coordinate tasks, dependencies, resources, and deadlines','category','building_operations')
      ), 6),
    ('da000007-0000-4000-8000-000000000007', v_assessment_id, 'Which situation would you most like to improve?', 'single_choice',
      jsonb_build_array(
        jsonb_build_object('value','people_community','label','People are not receiving the support or learning they need','category','people_community'),
        jsonb_build_object('value','analysis_problem_solving','label','The reasons behind a problem are not yet understood','category','analysis_problem_solving'),
        jsonb_build_object('value','communication_storytelling','label','Important information is hard to understand or act on','category','communication_storytelling'),
        jsonb_build_object('value','building_operations','label','A useful plan is not being delivered consistently','category','building_operations')
      ), 7),
    ('da000008-0000-4000-8000-000000000008', v_assessment_id, 'Which kind of progress would you most like to see from your work?', 'single_choice',
      jsonb_build_array(
        jsonb_build_object('value','people_community','label','People have stronger access, confidence, or capability','category','people_community'),
        jsonb_build_object('value','analysis_problem_solving','label','A decision is better informed by reliable evidence','category','analysis_problem_solving'),
        jsonb_build_object('value','communication_storytelling','label','More people understand and engage with an important idea','category','communication_storytelling'),
        jsonb_build_object('value','building_operations','label','A project or service is delivered more effectively','category','building_operations')
      ), 8)
  on conflict (id) do nothing;
end
$$;
