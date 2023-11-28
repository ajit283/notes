import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { PropsWithChildren } from "@kitajs/html";
import { tailwind } from "elysia-tailwind"; // 1. Import
import { staticPlugin } from "@elysiajs/static";
import Database from "libsql";
import { createClient } from "@libsql/client";

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
          id="content"
          class="text-xl font-custom  h-[100dvh] bg-black text-white flex flex-col p-3 fixed"
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
  .post("/edit", async ({ body }) => {
    //@ts-ignore
    await changeNote(body.text);
    return "ok";
  })

  .listen({
    port: process.env.PORT ?? 3000,
    hostname: "0.0.0.0",
  });

const Layout = ({ children }: PropsWithChildren) => (
  <html class="bg-black overflow-hidden fixed" lang="en">
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
      <script src="../public/main.js"></script>
      <link rel="stylesheet" href="/public/stylesheet.css" />
    </head>
    <body hx-boost="true">{children}</body>
  </html>
);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
