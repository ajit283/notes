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
import OpenAI from "openai";

declare global {
  namespace JSX {
    interface HtmlTag {
      ["oninput"]?: string;
    }
  }
}

const url = process.env.LIBSQL_URL!!;
const authToken = process.env.LIBSQL_TOKEN!!;
const openAiKey = process.env.OPENAI_KEY!!;

const openai = new OpenAI({
  apiKey: openAiKey,
});

const client = createClient({
  url: url,
  authToken: authToken,
});

await client.execute(
  "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, content TEXT)"
);

await client.execute(
  "CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY, title TEXT, chat TEXT)"
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

const getChats = async () => {
  const { rows } = await client.execute("select * from chats");
  return rows;
};

const addChat = async () => {
  return await client.execute({
    sql: "insert into chats (title, chat) values (?, ?) returning id",
    args: ["New Chat", "[]"],
  });
};

const fixedAuthToken = process.env.AUTH_TOKEN;

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
        <div class="flex flex-col dark:bg-black dark:text-white  bg-stone-100 font-custom p-3  h-[100dvh] text-xl">
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
      beforeHandle: ({ cookie: { notesAuthToken }, set, request }) => {
        console.log(notesAuthToken.get());
        if (
          notesAuthToken.get() !== fixedAuthToken &&
          request.headers.get("notes-auth-token") !== fixedAuthToken
        ) {
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
              <div
                id="wrapper"
                hx-ext="sse"
                class="font-custom p-3  h-[100dvh] text-xl"
                sse-connect="/event_stream"
              >
                <div
                  hx-get="/"
                  hx-trigger="sse:message"
                  hx-swap="morph:outerHTML"
                  id="content"
                  class=" h-full  dark:bg-black dark:text-white bg-stone-100 flex flex-col"
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
                        hx-target="#wrapper"
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
                  {Switcher("notes")}
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
        .group("/llm", (app) =>
          app
            .get("/", async () => {
              const chats = await getChats();
              console.log("here");

              return (
                <Layout>
                  <div class="flex flex-col items-start font-custom p-3  h-[100dvh] text-xl dark:text-white">
                    <button hx-post="/llm/add" hx-target="body">
                      Add{" "}
                    </button>
                    <div class="flex-grow flex flex-col  h-full  items-start w-full overflow-y-scroll">
                      {chats.toReversed().map((chat) => (
                        <div class="flex flex-row justify-between w-full">
                          <a hx-boost="false" href={`llm/chat/${chat.id}`}>
                            <div>{chat.title}</div>
                          </a>
                          <div>{chat.id}</div>
                        </div>
                      ))}
                    </div>
                    {Switcher("llm")}
                  </div>
                </Layout>
              );
            })
            .post("/add", ({ set }) => {
              addChat();
              // console.log(id.rows[0].id);
              set.redirect = "/llm";

              return "ok";
            })
            .get("/chat/:id", async ({ params }) => {
              const res = await client.execute({
                sql: "select chat from chats where id = ?",
                args: [params.id],
              });

              console.log("here");

              const chat: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
                await JSON.parse(res.rows[0].chat as string);
              return (
                <Layout>
                  <div
                    class="font-custom p-3  h-[100dvh] text-xl flex flex-col-reverse dark:text-white"
                    hx-ext="ws"
                    ws-connect="/completion"
                  >
                    {Switcher("llm")}
                    <div class="py-2">
                      <form
                        class="w-full flex flex-row gap-3"
                        hx-on="htmx:wsAfterSend: this.reset(); document.getElementById('textarea').rows=1"
                        ws-send
                        hx-trigger="submit, keyup[ctrlKey&&key=='Enter']"
                        id="chat-form"
                      >
                        <textarea
                          id="textarea"
                          rows="1"
                          onkeyup='this.style.height = "";this.style.height = (this.scrollHeight + 4) + "px"'
                          oninput='this.style.height = "";this.style.height = (this.scrollHeight + 4) + "px"'
                          class="dark:bg-black  resize-y dark:text-white  bg-stone-100  w-full border-2 border-black dark:border-white px-1 outline-none appearance-none focus:ring-0 focus:outline-none"
                          name="message"
                        />
                        <input name="id" hidden="true" value={params.id} />
                        <button type="submit">Send</button>
                      </form>
                    </div>
                    {ChatLayout("", "", chat)}
                  </div>
                </Layout>
              );
            })
        )
  )
  .ws("/completion", {
    async message(ws, message) {
      console.log(message);
      const res = await client.execute({
        sql: "select title, chat from chats where id = ?",
        args: [(message as { id: string }).id],
      });

      const chat: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        await JSON.parse(res.rows[0].chat as string);

      const parsedMessage = message as { message: string; id: string };

      const stream = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        stream: true,
        messages: [
          ...chat,
          {
            role: "user",
            content: parsedMessage.message,
          },
        ],
      });

      let msg = "";

      for await (const message of stream) {
        msg += message.choices[0].delta.content ?? "\n";
        ws.send(ChatLayout(msg, parsedMessage.message, chat));
      }

      if (res.rows[0].title === "New Chat") {
        const chatCompletion = await openai.chat.completions.create({
          messages: [
            { role: "user", content: "Summarize this chat in 2 words:" + msg },
          ],
          model: "gpt-4-1106-preview",
        });

        const title = chatCompletion.choices[0].message.content;

        await client.execute({
          sql: "update chats set title = ? where id = ?",
          args: [title, parsedMessage.id],
        });
      }

      await client.execute({
        sql: "update chats set chat = ? where id = ?",
        args: [
          JSON.stringify([
            ...chat,
            { role: "user", content: parsedMessage.message },
            { role: "assistant", content: msg },
          ]),
          parsedMessage.id,
        ],
      });
    },
  })

  .listen({
    port: process.env.PORT ?? 3000,
    hostname: "0.0.0.0",
  });

const ChatLayout = (
  msg: string,
  userMsg: string,
  chat: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
) => {
  // detect code blocks and format them
  const addNewLines = (utext: string) => {
    let text = wrapCodeInHtml(utext);
    text = text.replaceAll("\n", "<br />");
    return text;
  };

  function wrapCodeInHtml(text: string): string {
    // Regular expression to match code blocks
    const codeBlockRegex = /```(\w+(?:-\w+)?)\n([\s\S]*?)```/g;

    // Replace each code block with a version wrapped in a div
    return text.replace(codeBlockRegex, (match, lang, code) => {
      // Escape HTML special characters in the code
      const escapedCode = code

        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/ /g, "&nbsp;") // Replace spaces with non-breaking space
        .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;"); // Replace tabs with four non-breaking spaces
      // .replace(/\n/g, "<br>"); // Replace newline characters with <br> tags

      // Wrap in a div and include language as a class, if provided
      return `<div class=" whitespace-nowrap p-2 border-2 border-black dark:border-white my-3  overflow-x-scroll text-sm ${
        lang || ""
      }">${escapedCode}</div>`;
    });
  }

  return (
    <div
      id="chat"
      hx-swap-oob="idiomorph"
      class="flex-grow flex flex-col gap-3 overflow-y-scroll text-base overflow-x-hidden"
    >
      {msg != "" ? (
        <div>
          <div class="text-blue-700">assistant</div>
          <div>{addNewLines(msg)}</div>
        </div>
      ) : (
        <div></div>
      )}
      {userMsg != "" ? (
        <div>
          <div class="text-blue-700">user</div>
          <div>{addNewLines(userMsg)}</div>
        </div>
      ) : (
        <div></div>
      )}
      {chat.toReversed().map((message) => (
        <div class="flex flex-col">
          <div class="text-blue-700">{message.role}</div>
          <div>{addNewLines(message.content as string)}</div>
        </div>
      ))}
    </div>
  );
};

const Switcher = (current: "notes" | "llm") => {
  return (
    <div class="pt-1 flex flex-row gap-3 dark:text-white text-black">
      <a
        href="/"
        hx-boost="true"
        class={`${
          current === "notes" &&
          "bg-black dark:bg-white dark:text-black text-white"
        }`}
      >
        <button>notes</button>
      </a>
      <a
        href="/llm"
        hx-boost="true"
        class={`${
          current === "llm" &&
          "bg-black dark:bg-white dark:text-black text-white"
        }`}
      >
        <button>llm</button>
      </a>
    </div>
  );
};

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
      <script src="https://unpkg.com/htmx.org/dist/ext/ws.js"></script>
      <script src="https://unpkg.com/idiomorph/dist/idiomorph-ext.min.js"></script>
      <script src="/public/main.js"></script>
      <link rel="stylesheet" href="/public/stylesheet.css" />
      <link rel="apple-touch-icon" href="../public/icon.png"></link>
      <link rel="icon" href="../public/icon.png" type="image/png"></link>
      <meta name="apple-mobile-web-app-capable" content="yes"></meta>
      <link rel="apple-touch-startup-image" href="/../public/icon.png"></link>
    </head>
    <body id="body" hx-ext="morph" hx-boost="true">
      {children}
    </body>
  </html>
);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
