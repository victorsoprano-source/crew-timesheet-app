-- Create cost_codes table for construction job codes
CREATE TABLE IF NOT EXISTS cost_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  job_group VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(code, job_group)
);

-- Create index for fast searching
CREATE INDEX IF NOT EXISTS idx_cost_codes_code ON cost_codes(code);
CREATE INDEX IF NOT EXISTS idx_cost_codes_job_group ON cost_codes(job_group);
CREATE INDEX IF NOT EXISTS idx_cost_codes_search ON cost_codes(code, description);

-- Insert real construction cost codes for C-34921 (current job)
INSERT INTO cost_codes (code, description, job_group) VALUES
  -- Electrical Division (100s)
  ('100-001', 'Electrical Rough-In', 'C-34921'),
  ('100-002', 'Panel Installation', 'C-34921'),
  ('100-003', 'Wire & Cable Pulling', 'C-34921'),
  ('100-004', 'Conduit Installation', 'C-34921'),
  ('100-005', 'Junction Box Install', 'C-34921'),
  ('100-006', 'Electrical Troubleshooting', 'C-34921'),
  ('100-007', 'Load Center Wiring', 'C-34921'),
  ('100-008', 'Meter Base Install', 'C-34921'),
  
  -- Lighting Division (110s)
  ('110-001', 'Light Fixture Installation', 'C-34921'),
  ('110-002', 'Emergency Lighting', 'C-34921'),
  ('110-003', 'Exit Sign Installation', 'C-34921'),
  ('110-004', 'Exterior Lighting', 'C-34921'),
  ('110-005', 'Recessed Lighting Install', 'C-34921'),
  ('110-006', 'Track Lighting Install', 'C-34921'),
  
  -- Low Voltage (120s)
  ('120-001', 'Install Cables & Terminations', 'C-34921'),
  ('120-002', 'Data Cable Pulling', 'C-34921'),
  ('120-003', 'Fire Alarm Wiring', 'C-34921'),
  ('120-004', 'Security System Wiring', 'C-34921'),
  ('120-005', 'Intercom System Install', 'C-34921'),
  ('120-006', 'Access Control Wiring', 'C-34921'),
  ('120-007', 'Camera System Wiring', 'C-34921'),
  
  -- HVAC/Mechanical (130s)
  ('130-001', 'HVAC Equipment Install', 'C-34921'),
  ('130-002', 'Ductwork Installation', 'C-34921'),
  ('130-003', 'HVAC Controls Wiring', 'C-34921'),
  ('130-004', 'Exhaust Fan Install', 'C-34921'),
  ('130-005', 'RTU Installation', 'C-34921'),
  ('130-006', 'Split System Install', 'C-34921'),
  
  -- Plumbing (140s)
  ('140-001', 'Plumbing Rough-In', 'C-34921'),
  ('140-002', 'Fixture Installation', 'C-34921'),
  ('140-003', 'Water Heater Install', 'C-34921'),
  ('140-004', 'Drain Line Install', 'C-34921'),
  ('140-005', 'Water Line Install', 'C-34921'),
  ('140-006', 'Gas Line Install', 'C-34921'),
  
  -- Painting (200s)
  ('200-001', 'Surface Preparation', 'C-34921'),
  ('200-002', 'Primer Application', 'C-34921'),
  ('200-003', 'Interior Wall Painting', 'C-34921'),
  ('200-004', 'Exterior Wall Painting', 'C-34921'),
  ('200-005', 'Trim & Door Painting', 'C-34921'),
  ('200-006', 'Ceiling Painting', 'C-34921'),
  ('200-007', 'Epoxy Floor Coating', 'C-34921'),
  ('200-008', 'Specialty Coatings', 'C-34921'),
  ('200-009', 'Touch-Up & Punch List', 'C-34921'),
  ('200-010', 'Pressure Washing', 'C-34921'),
  ('200-011', 'Caulking & Sealing', 'C-34921'),
  ('200-012', 'Drywall Repair', 'C-34921'),
  
  -- Carpentry (300s)
  ('300-001', 'Framing', 'C-34921'),
  ('300-002', 'Drywall Installation', 'C-34921'),
  ('300-003', 'Door Installation', 'C-34921'),
  ('300-004', 'Window Installation', 'C-34921'),
  ('300-005', 'Trim Installation', 'C-34921'),
  ('300-006', 'Cabinet Installation', 'C-34921'),
  ('300-007', 'Countertop Install', 'C-34921'),
  ('300-008', 'Blocking Install', 'C-34921'),
  
  -- Site Work (400s)
  ('400-001', 'Site Mobilization', 'C-34921'),
  ('400-002', 'Material Handling', 'C-34921'),
  ('400-003', 'Cleanup & Debris Removal', 'C-34921'),
  ('400-004', 'Safety Setup', 'C-34921'),
  ('400-005', 'Scaffold Erection', 'C-34921'),
  ('400-006', 'Lift Operation', 'C-34921'),
  ('400-007', 'Protection & Masking', 'C-34921'),
  
  -- General/Admin (500s)
  ('500-001', 'Supervision', 'C-34921'),
  ('500-002', 'Safety Meeting', 'C-34921'),
  ('500-003', 'Project Coordination', 'C-34921'),
  ('500-004', 'Tool Maintenance', 'C-34921'),
  ('500-005', 'Travel Time', 'C-34921'),
  ('500-006', 'Training', 'C-34921'),
  ('500-007', 'Inspections', 'C-34921'),
  
  -- Specialty (600s)
  ('600-001', 'Waterproofing', 'C-34921'),
  ('600-002', 'Fireproofing', 'C-34921'),
  ('600-003', 'Insulation Install', 'C-34921'),
  ('600-004', 'Acoustical Ceiling', 'C-34921'),
  ('600-005', 'Flooring Install', 'C-34921'),
  ('600-006', 'Tile Installation', 'C-34921')
ON CONFLICT (code, job_group) DO NOTHING;

-- Insert some codes for other job groups
INSERT INTO cost_codes (code, description, job_group) VALUES
  ('200-001', 'Surface Preparation', 'C-34925'),
  ('200-002', 'Primer Application', 'C-34925'),
  ('200-003', 'Interior Wall Painting', 'C-34925'),
  ('200-004', 'Exterior Wall Painting', 'C-34925'),
  ('500-001', 'Supervision', 'C-34925'),
  ('500-002', 'Safety Meeting', 'C-34925'),
  
  ('200-001', 'Surface Preparation', 'C-33600'),
  ('200-002', 'Primer Application', 'C-33600'),
  ('200-003', 'Interior Wall Painting', 'C-33600'),
  ('500-001', 'Supervision', 'C-33600')
ON CONFLICT (code, job_group) DO NOTHING;
