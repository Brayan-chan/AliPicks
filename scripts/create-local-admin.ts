import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Use the local Project URL and Secret key from `bunx supabase status`.",
  );
  process.exit(1);
}

if (!supabaseUrl.startsWith("http://127.0.0.1:") && !supabaseUrl.startsWith("http://localhost:")) {
  console.error("Refusing to create the QA admin against a non-local Supabase URL.");
  process.exit(1);
}

const email = "admin.local@alipicks.test";
const password = "AliPicksLocal123!";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) throw listError;

let user = listed.users.find((candidate) => candidate.email === email);

if (user) {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "AliPicks Local Admin",
      is_adult: true,
    },
  });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "AliPicks Local Admin",
      is_adult: true,
    },
  });
  if (error) throw error;
  user = data.user;
}

if (!user) throw new Error("Auth Admin API did not return a user.");

const { error: profileError } = await supabase.from("profiles").upsert({
  id: user.id,
  email,
  full_name: "AliPicks Local Admin",
  is_adult: true,
});
if (profileError) throw profileError;

const { error: roleError } = await supabase.from("user_roles").upsert(
  {
    user_id: user.id,
    role: "admin",
  },
  { onConflict: "user_id,role" },
);
if (roleError) throw roleError;

console.log("Local QA admin ready:");
console.log(`  ${email}`);
console.log(`  ${password}`);
