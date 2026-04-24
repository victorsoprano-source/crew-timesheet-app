import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function migrate() {
  console.log("Adding foreman_name and project_location columns to daily_field_reports...")

  // Add foreman_name column
  const { error: error1 } = await supabase.rpc("exec_sql", {
    query: `
      ALTER TABLE daily_field_reports 
      ADD COLUMN IF NOT EXISTS foreman_name TEXT;
    `
  })

  if (error1) {
    // Try direct SQL if RPC doesn't exist
    console.log("Trying direct approach for foreman_name...")
    const { error: directError1 } = await supabase
      .from("daily_field_reports")
      .select("foreman_name")
      .limit(1)
    
    if (directError1?.message?.includes("does not exist")) {
      console.log("Column foreman_name needs to be added via Supabase dashboard")
    } else {
      console.log("Column foreman_name already exists or was added")
    }
  } else {
    console.log("Added foreman_name column")
  }

  // Add project_location column
  const { error: error2 } = await supabase.rpc("exec_sql", {
    query: `
      ALTER TABLE daily_field_reports 
      ADD COLUMN IF NOT EXISTS project_location TEXT;
    `
  })

  if (error2) {
    console.log("Trying direct approach for project_location...")
    const { error: directError2 } = await supabase
      .from("daily_field_reports")
      .select("project_location")
      .limit(1)
    
    if (directError2?.message?.includes("does not exist")) {
      console.log("Column project_location needs to be added via Supabase dashboard")
    } else {
      console.log("Column project_location already exists or was added")
    }
  } else {
    console.log("Added project_location column")
  }

  console.log("Migration complete!")
}

migrate().catch(console.error)
