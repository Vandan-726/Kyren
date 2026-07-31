import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const secret = '4d87dc5c894e2a3deefe1a522dfb6b0920d06a4d67d78f7052d1eb2dfd00e298'; // from .env JWT_SECRET
const userId = '2eb687e4-f14f-4de2-9a3f-d02e59c0d3c8'; // from test_supabase.mjs output

const token = 'TEST_MODE';

async function run() {
  const res = await fetch("http://localhost:3001/api/base44/Conversation?user_id=" + userId + "&context_type=doubt_solver&orderBy=-created_date&debug=true", {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Data:", JSON.stringify(data).substring(0, 500));
}

run();
