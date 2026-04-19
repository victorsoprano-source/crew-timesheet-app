import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createReportPhotosTable() {
  console.log("Creating report_photos table...")

  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS report_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        week_start DATE NOT NULL,
        work_date DATE NOT NULL,
        photo_pathname TEXT NOT NULL,
        caption TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_report_photos_week_date ON report_photos(week_start, work_date);
    `,
  })

  if (error) {
    // If RPC doesn't exist, try direct insert to test table existence
    console.log("RPC not available, checking if table exists via query...")
    
    const { error: queryError } = await supabase
      .from("report_photos")
      .select("id")
      .limit(1)

    if (queryError && queryError.code === "42P01") {
      console.error("Table does not exist. Please create it manually in Supabase dashboard:")
      console.log(`
CREATE TABLE report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  work_date DATE NOT NULL,
  photo_pathname TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_photos_week_date ON report_photos(week_start, work_date);
      `)
      return
    }
    
    console.log("Table already exists or query succeeded")
    return
  }

  console.log("Table created successfully!")
}

createReportPhotosTable()
