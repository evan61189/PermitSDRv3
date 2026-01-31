-- Add tasks/reminders table for follow-up tracking
-- Run this migration to add task management to the pipeline

-- Create task priority enum
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

-- Create tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority task_priority NOT NULL DEFAULT 'medium',
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_tasks_permit ON tasks(permit_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_completed ON tasks(completed);
CREATE INDEX idx_tasks_priority ON tasks(priority);

-- Index for finding overdue tasks
CREATE INDEX idx_tasks_overdue ON tasks(due_date, completed) WHERE completed = FALSE;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow read access for authenticated users" ON tasks
  FOR SELECT TO authenticated USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access" ON tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon role to read and write (for dashboard without auth)
CREATE POLICY "Allow anon read access" ON tasks
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert access" ON tasks
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update access" ON tasks
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete access" ON tasks
  FOR DELETE TO anon USING (true);

-- Create view for tasks with permit info
CREATE OR REPLACE VIEW tasks_with_permits AS
SELECT
  t.*,
  p.permit_number,
  p.address,
  p.city,
  p.project_type,
  p.pipeline_stage,
  p.applicant_name
FROM tasks t
JOIN permits p ON t.permit_id = p.id;

-- Grant permissions
GRANT SELECT ON tasks_with_permits TO authenticated;
GRANT SELECT ON tasks_with_permits TO anon;

COMMENT ON TABLE tasks IS 'Follow-up tasks and reminders linked to permits';
