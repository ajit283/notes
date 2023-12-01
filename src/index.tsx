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

const eventEmitter = new EventEmitter();

let history: string[] = [note as string];

let timeOut: NodeJS.Timeout | null;
let timeOutRunning = false;

const changeNote = async (text: string, writeToHistory = true) => {
  note = text;
  if (timeOut) {
    clearTimeout(timeOut);
  }
  timeOutRunning = true;
  timeOut = setTimeout(async () => {
    if (writeToHistory) {
      history.push(text);
    }
    await client.execute({
      sql: "update notes set content = ? where id = 0",
      args: [text],
    });
    timeOutRunning = false;
  }, 5000);
};

const fixedAuthToken = crypto.randomUUID();

const getId = (request: Request) => {
  const ip = request.headers.get("x-envoy-external-address");
  const userAgent = request.headers.get("user-agent");
  console.log(userAgent);

  return (ip ?? "") + userAgent;
};

const app = new Elysia()

  .use(html())
  .use(
    tailwind({
      path: "/public/stylesheet.css",
      source: "./src/styles.css",
      config: "./tailwind.config.js",
    })
  )
  .use(staticPlugin())
  .use((app) =>
    app.derive(({ request }) => ({ ip: app.server?.requestIP(request) }))
  )
  .get("/authpage", () => {
    return (
      <Layout>
        <div class="flex flex-col font-custom text-xl p-3 dark:bg-black dark:text-white  bg-stone-100">
          <div class="flex flex-row justify-between">
            <div>Password</div>
          </div>
          <div class="w-full overflow-x-hidden">
            ====================================================================================================================================================================================================================================
          </div>
          <form
            hx-post="/auth"
            hx-target="body"
            hx-push-url="true"
            class="flex flex-row justify-center items-center gap-3 pt-2"
          >
            <input
              type="password"
              name="password"
              id="password"
              class="dark:bg-black dark:text-white max-w-lg bg-stone-100  w-full border-2 border-black dark:border-white px-1 outline-none appearance-none focus:ring-0 focus:outline-none"
            />
            <button type="submit" class="text-black dark:text-white">
              Submit
            </button>
          </form>
        </div>
      </Layout>
    );
  })
  .post(
    "/auth",
    ({ body, set, cookie: { notesAuthToken } }) => {
      if (body.password === process.env.PASSWORD) {
        notesAuthToken.set({
          value: fixedAuthToken,
        });
        set.redirect = "/";
      } else {
        set.redirect = "/authpage";
      }
      return "ok";
    },
    { body: t.Object({ password: t.String() }) }
  )
  .guard(
    {
      beforeHandle: ({ cookie: { notesAuthToken }, set }) => {
        console.log(notesAuthToken.get());
        if (notesAuthToken.get() !== fixedAuthToken) {
          set.redirect = "/authpage";
          return "ok";
        }
      },
    },
    (app) =>
      app
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
            res = await client.execute(
              "select content from notes where id = 0"
            );
            note = res.rows[0].content;
          }

          return (
            <Layout>
              <div id="wrapper" hx-ext="sse" sse-connect="/event_stream">
                <div
                  hx-get="/"
                  hx-trigger="sse:message"
                  hx-swap="morph:outerHTML"
                  id="content"
                  class="text-xl font-custom  h-[100dvh] dark:bg-black dark:text-white bg-stone-100 flex flex-col p-3"
                >
                  <div class="flex flex-row justify-between">
                    <div>{getCurrentDate()}</div>

                    <div class="flex flex-row gap-3">
                      <button
                        hx-post="/logout"
                        hx-target="body"
                        hx-push-url="true"
                      >
                        X
                      </button>
                      <button
                        hx-post="/rollback"
                        hx-target="#content"
                        class="inline-block"
                      >
                        &lt;&lt;
                      </button>
                    </div>
                  </div>
                  <div class="w-full overflow-x-hidden">
                    ====================================================================================================================================================================================================================================
                  </div>
                  <textarea
                    spellcheck="false"
                    hx-post="/edit"
                    hx-trigger="keyup changed"
                    hx-swap="none"
                    name="text"
                    id="textarea"
                    class="dark:bg-black bg-stone-100  w-full flex-grow border-none outline-none appearance-none focus:ring-0 focus:outline-none"
                  >
                    {note}
                  </textarea>
                </div>
              </div>
            </Layout>
          );
        })
        .post("/logout", ({ set, cookie: { notesAuthToken } }) => {
          notesAuthToken.set({
            value: "",
          });
          set.redirect = "/authpage";
          return "ok";
        })
        .get("/text", () => note)
        .post("/rollback", ({ set }) => {
          console.log(history);
          if (history.length > 1) {
            history.pop();
            changeNote(history[history.length - 1]!!, false);
          }
          set.redirect = "/";
          return "ok";
        })
        .post(
          "/edit",
          async ({ body, request }) => {
            await changeNote(body.text);
            const id = getId(request);
            eventEmitter.emit("message", id);
            return "ok";
          },
          { body: t.Object({ text: t.String() }) }
        )
        .post(
          "/prepend",
          ({ body }) => {
            changeNote(body.text + "\n\n" + note);
            return "ok";
          },
          { body: t.Object({ text: t.String() }) }
        )
        //@ts-ignore
        .get("/event_stream", ({ request }) => {
          console.log("new connection");

          const id = getId(request);

          const stream = new Stream((stream) => {
            const eventId = id;

            const eventFun = (ip: any) => {
              console.log("editor IP address: " + ip);
              //@ts-ignore
              console.log("potential recipient IP address: " + eventId);
              //@ts-ignore
              if (ip !== eventId) {
                stream.send("message");
              }
            };

            eventEmitter.on("message", eventFun);
            request.signal.addEventListener("abort", () => {
              eventEmitter.off("message", eventFun);
              console.log("closed");
            });
            stream.event = "message";
          });

          return stream;
        })
  )

  .listen({
    port: process.env.PORT ?? 3000,
    hostname: "0.0.0.0",
  });

const Layout = ({ children }: PropsWithChildren) => (
  <html class="dark:bg-black bg-stone-100 overflow-hidden" lang="en">
    <head>
      <title>Notes</title>
      <meta charset="utf-8" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
      />

      <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      <meta name="apple-mobile-web-app-title" content="Notes" />
      <script src="https://unpkg.com/htmx.org@1.9.9"></script>
      <script src="https://unpkg.com/htmx.org/dist/ext/sse.js"></script>
      <script src="https://unpkg.com/idiomorph/dist/idiomorph-ext.min.js"></script>
      <script src="../public/main.js"></script>
      <link rel="stylesheet" href="/public/stylesheet.css" />
      <link rel="apple-touch-icon" href="../public/icon.png"></link>
      <link rel="icon" href="../public/icon.png" type="image/png"></link>
    </head>
    <body id="body" hx-ext="morph" hx-boost="true">
      {children}
    </body>
  </html>
);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
