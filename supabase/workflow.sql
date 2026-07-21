-- ============================================
-- Stardust 工作流自动化 — Supabase Schema
-- ============================================

-- 工作流定义表
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 自动更新 updated_at 触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_workflow_definitions_updated_at ON workflow_definitions;
CREATE TRIGGER update_workflow_definitions_updated_at
  BEFORE UPDATE ON workflow_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 工作流执行历史表
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_payload JSONB,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  node_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_wf_defs_user ON workflow_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_defs_enabled ON workflow_definitions(enabled);
CREATE INDEX IF NOT EXISTS idx_wf_execs_wf ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wf_execs_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_wf_execs_started ON workflow_executions(started_at DESC);

-- RLS
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: 用户只能操作自己的工作流
DROP POLICY IF EXISTS "Users can CRUD own workflow definitions" ON workflow_definitions;
CREATE POLICY "Users can CRUD own workflow definitions"
  ON workflow_definitions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can CRUD own workflow executions" ON workflow_executions;
CREATE POLICY "Users can CRUD own workflow executions"
  ON workflow_executions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
