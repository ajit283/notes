import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { PropsWithChildren } from "@kitajs/html";
import { tailwind } from "elysia-tailwind"; // 1. Import
import { staticPlugin } from "@elysiajs/static";
import Database from "libsql";
import { createClient } from "@libsql/client";
import { Stream } from "@elysiajs/stream";
import { EventEmitter } from "events";
import { cors } from "@elysiajs/cors";
import { randomUUID } from "crypto";

const url = process.env.LIBSQL_URL!!;
const authToken = process.env.LIBSQL_TOKEN!!;

const client = createClient({
  url: url,
  authToken: authToken,
});

await client.execute(
  "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, content TEXT)"
);

const changeNote = async (text: string) => {
  await client.execute({
    sql: "update notes set content = ? where id = 0",
    args: [text],
  });
};

const eventEmitter = new EventEmitter();

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
  .get("/", async ({ cookie: { clientUuid } }) => {
    const note = await client.execute("select content from notes where id = 0");

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

    // console.log(clientUuid);
    if (!clientUuid.value) {
      clientUuid.value = randomUUID();
      console.log("clientUUID, /", clientUuid.value);
    }

    return (
      <Layout>
        <div
          hx-get="/"
          hx-trigger="sse:message"
          hx-swap="outerHTML"
          class="text-2xl font-custom  bg-black text-white flex flex-col p-3"
        >
          <div>{getCurrentDate()}</div>
          <div>=========================</div>
          <textarea
            id="textarea"
            spellcheck="false"
            hx-post="/edit"
            hx-swap="none"
            hx-trigger="keyup changed"
            name="text"
            class="bg-black text-white w-full min-h-screen border-none outline-none appearance-none focus:ring-0 focus:outline-none"
          >
            {note.rows[0].content}
          </textarea>
        </div>
      </Layout>
    );
  })
  .post("/edit", async ({ body, cookie: { clientUuid } }) => {
    //@ts-ignore
    await changeNote(body.text);
    console.log(clientUuid.value);
    console.log("clientUUID, edit", clientUuid.value);
    eventEmitter.emit("change", clientUuid.value);
    return "ok";
  })
  .get("/event_stream", ({ cookie: { clientUuid } }) => {
    console.log("clientUUID, event_stream", clientUuid.value);
    return new Stream((stream) => {
      eventEmitter.on("change", async (uuid) => {
        if (uuid !== clientUuid.value) {
          console.log("FIRE @", uuid, clientUuid.value);
          stream.send("message");
        }
      });
    });
  })
  .use(cors())
  .listen({
    port: process.env.PORT ?? 3000,
    hostname: "0.0.0.0",
  });

const Layout = ({ children }: PropsWithChildren) => (
  <html lang="en">
    <head>
      <title>Notes</title>

      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />

      <script src="https://unpkg.com/htmx.org@1.9.9"></script>
      <script src="https://unpkg.com/htmx.org/dist/ext/sse.js"></script>
      <script src="../public/main.js"></script>
      <link rel="stylesheet" href="/public/stylesheet.css" />
    </head>
    <body hx-ext="sse" sse-connect="/event_stream">
      {children}
    </body>
  </html>
);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
