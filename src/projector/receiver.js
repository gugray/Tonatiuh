function truncate(str) {
  const newline = str.indexOf("\n");
  const end = newline >= 0 && newline < 32 ? newline : 32;
  let res = str.slice(0, end);
  if (res.length < str.length) res += " [...]";
  return res;
}

export function initReceiver(socketUrl, onMessage) {
  let state = 0;
  let socket = null;

  const connectSocket = () => {
    if (state == 1) return;
    console.log("Receiver socket: connecting...");
    state = 1;
    socket = new WebSocket(socketUrl);
    socket.addEventListener("open", () => {
      state = 2;
      console.log("Receiver socket open");
    });
    socket.addEventListener("message", (event) => {
      const msgStr = event.data;
      console.log(`Receiver message: ${truncate(msgStr, 64).replaceAll("\n", " ")}`);
      let msgObj;
      try {
        msgObj = JSON.parse(msgStr);
      } catch {
        console.error("Message is not valid JSON");
      }
      if (msgObj && onMessage) onMessage(msgObj);
    });
    socket.addEventListener("close", () => {
      state = 0;
      console.log("Receiver socket closed");
      setTimeout(() => connectSocket(), 1000);
    });
  };

  setInterval(() => {
    if (socket != null && state == 2) socket.send("ping");
  }, 5000);

  connectSocket();
}
