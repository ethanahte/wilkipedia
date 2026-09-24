// Supabase connection. Both values are PUBLIC by design: they ship to every
// visitor's browser, and the database's row-level security (supabase/schema.sql)
// is what actually protects data.
//
// NEVER put the service_role / secret key or the database password here.
//
// Leave both empty to run in DEMO MODE: everything works, but claims,
// submissions and comments are saved only in your own browser.
export const SUPABASE_URL = 'https://lhkfwzmybqqxjtuubzvb.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_I9fukEJb8kqP9wjIGyrU_Q_rnM5d48V';
