import fetch from "node-fetch";

async function run() {
  const res = await fetch("http://localhost:3001/api/base44/entities/Conversation?context_type=doubt_solver", {
    headers: {
      "Authorization": "Bearer test" // Assuming auth is mocked or we can bypass?
    }
  });
  console.log("Conversations status:", res.status);
  const convs = await res.json();
  console.log("Conversations:", JSON.stringify(convs).substring(0, 500));

  if (convs && convs.data && convs.data.length > 0) {
    const cid = convs.data[0].id;
    const msgRes = await fetch(`http://localhost:3001/api/base44/entities/Message?conversation_id=${cid}`, {
      headers: {
        "Authorization": "Bearer test"
      }
    });
    console.log("Messages status:", msgRes.status);
    const msgs = await msgRes.json();
    console.log("Messages:", JSON.stringify(msgs).substring(0, 1000));
  }
}
run();
