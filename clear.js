require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearTestOrders() {
  console.log("Clearing orders...");
  const { error: e1 } = await supabase.from('orders').delete().neq('id', 'dummy');
  if (e1) console.error("Error clearing orders:", e1);
  else console.log("Orders cleared!");

  const { error: e2 } = await supabase.from('order_history').delete().neq('id', 'dummy');
  if (e2) console.error("Error clearing history:", e2);
  else console.log("History cleared!");
}

clearTestOrders();
