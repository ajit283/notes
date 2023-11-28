import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { PropsWithChildren } from "@kitajs/html";
import { tailwind } from "elysia-tailwind"; // 1. Import
import { staticPlugin } from "@elysiajs/static";
import { ip } from "elysia-ip";
import Database from "libsql";
import { createClient } from "@libsql/client";
import { EventEmitter } from "events";
import { Stream } from "@elysiajs/stream";

const url = process.env.LIBSQL_URL!!;
const authToken = process.env.LIBSQL_TOKEN!!;

const client = createClient({
  url: url,
  authToken: authToken,
});

await client.execute(
  "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, content TEXT)"
);

let res = await client.execute("select content from notes where id = 0");

let note = res.rows[0].content;

let timeOut: NodeJS.Timeout | null;
let timeOutRunning = false;

const changeNote = async (text: string) => {
  note = text;
  if (timeOut) {
    clearTimeout(timeOut);
  }
  timeOutRunning = true;
  timeOut = setTimeout(async () => {
    // console.log("sending to db", text);
    await client.execute({
      sql: "update notes set content = ? where id = 0",
      args: [text],
    });
    timeOutRunning = false;
  }, 5000);
};

const eventEmitter = new EventEmitter();

const MAX_LISTENERS = 50;

eventEmitter.setMaxListeners(MAX_LISTENERS + 3);

// Define a type for the listener function
type ListenerFunction = (...args: any[]) => void;

// Array to keep track of listeners
let listeners: ListenerFunction[] = [];

// Function to add a listener
function addListener(eventName: string, listenerFunction: ListenerFunction) {
  console.log("adding event listener");
  eventEmitter.on(eventName, listenerFunction);
  listeners.push(listenerFunction); // Add to tracking array
  console.log(listeners);
  console.log(listeners.length);

  // Check and remove the oldest listener if limit exceeded
  if (listeners.length >= MAX_LISTENERS) {
    console.log("removing");
    const oldestListener = listeners.shift(); // Remove from tracking array
    if (oldestListener) {
      eventEmitter.removeListener(eventName, oldestListener); // Remove from EventEmitter
    }
    console.log("Removed oldest listener");
  }
}

const app = new Elysia()

  .use(html())
  .use(
    tailwind({
      // 2. Use
      path: "/public/stylesheet.css", // 2.1 Where to serve the compiled stylesheet;
      source: "./src/styles.css", // 2.2 Specify source file path (where your @tailwind directives are);
      config: "./tailwind.config.js", // 2.3 Specify config file path or Config object;
    })
  )
  .use(staticPlugin())
  .use(ip())
  .get("/", async () => {
    function getCurrentDate(): string {
      const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      const now = new Date();
      const day = days[now.getDay()];
      const date = now.getDate();
      const month = months[now.getMonth()];
      const year = now.getFullYear();

      const ordinalDate =
        date +
        (date > 0
          ? ["th", "st", "nd", "rd"][
              (date > 3 && date < 21) || date % 10 > 3 ? 0 : date % 10
            ]
          : "");

      return `${day}, ${ordinalDate} ${month} ${year}`;
    }

    if (!timeOutRunning) {
      res = await client.execute("select content from notes where id = 0");
      note = res.rows[0].content;
    }

    return (
      <Layout>
        <div
          hx-get="/"
          hx-trigger="sse:message"
          hx-swap="outerHTML"
          id="content"
          class="text-xl font-custom  h-[100dvh] bg-black text-white flex flex-col p-3"
        >
          <div>{getCurrentDate()}</div>
          <div class="w-full overflow-x-hidden">
            ======================================
          </div>
          <textarea
            spellcheck="false"
            hx-post="/edit"
            hx-trigger="keyup changed"
            hx-swap="none"
            name="text"
            class="bg-black text-white w-full flex-grow border-none outline-none appearance-none focus:ring-0 focus:outline-none"
          >
            {note}
          </textarea>
        </div>
      </Layout>
    );
  })
  .post("/edit", async ({ body, set }) => {
    //@ts-ignore
    await changeNote(body.text);
    set.redirect = "/get_ip";
    return "ok";
  })
  .get("/get_ip", async ({ ip }) => {
    console.log("ip:", ip);
    eventEmitter.emit("change", ip);
    return "ok";
  })
  .get("/event_stream", ({ ip }) => {
    console.log("/event_stream ip:", ip);
    return new Stream((stream) => {
      //@ts-ignore
      const onChangeListener = async (editIp) => {
        //@ts-ignore
        console.log("onChangeListener", editIp.address, ip.address);
        //@ts-ignore
        if (ip.address !== editIp.address) {
          console.log("sending message");
          stream.send("message");
        } else {
          console.log("not sending message");
        }
      };
      // eventEmitter.on("change", (event, listener) => {});
      addListener("change", onChangeListener);
    });
  })
  .listen({
    port: process.env.PORT ?? 3000,
    hostname: "0.0.0.0",
  });

const Layout = ({ children }: PropsWithChildren) => (
  <html class="bg-black overflow-hidden" lang="en">
    <head>
      <title>Notes</title>
      <meta charset="utf-8" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
      />

      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      <meta name="apple-mobile-web-app-title" content="Notes" />
      <script src="https://unpkg.com/htmx.org@1.9.9"></script>
      <script src="https://unpkg.com/htmx.org/dist/ext/sse.js"></script>
      <script src="../public/main.js"></script>
      <link rel="stylesheet" href="/public/stylesheet.css" />
    </head>
    <body hx-boost="true" hx-ext="sse" sse-connect="/event_stream">
      {children}
    </body>
  </html>
);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
