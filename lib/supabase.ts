import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Untyped client - explicit casts in page files provide type safety
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
