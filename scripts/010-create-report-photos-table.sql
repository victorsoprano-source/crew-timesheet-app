-- Create table for storing photos associated with daily reports
CREATE TABLE IF NOT EXISTS report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  work_date DATE NOT NULL,
  photo_pathname TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups by week and date
CREATE INDEX IF NOT EXISTS idx_report_photos_week_date ON report_photos(week_start, work_date);
