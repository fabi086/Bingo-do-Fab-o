import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yzjyjarzszwldbuwjueq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6anlqYXJ6c3p3bGRidXdqdWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMzU5NjMsImV4cCI6MjA3ODgxMTk2M30.4CD1uJgj0iEkp4n_dNAa9-G5EZid1p9wQPb0z1kvdJY';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Key are required. Please check your configuration.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
