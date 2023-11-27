type todo =
  { text : string
  ; done_ : bool
  ; user : string
  ; id : int
  }

module type DB = Caqti_lwt.CONNECTION

module T = Caqti_type

(* Define a query to read a note *)
let read_note_query =
  let open Caqti_request.Infix in
  (T.unit ->? T.string) (* Using ->? for zero or one row *)
    "SELECT content FROM notes WHERE id = 1" (* Adjust based on your table structure *)
;;

(* Function to read a note from the database *)
let read_note (module Db : DB) =
  let%lwt content_or_error = Db.find_opt read_note_query () in
  match content_or_error with
  | Ok (Some content) -> Lwt.return content (* Handle the case where content is found *)
  | Ok None ->
    Lwt.fail_with "No content found" (* Handle the case where no content is found *)
  | Error e -> Lwt.fail_with (Caqti_error.show e)
;;

(* Handle errors *)

(* Define a query to update a note *)
let update_note_query =
  let open Caqti_request.Infix in
  (T.string ->. T.unit)
    "UPDATE notes SET content = ? WHERE id = 1" (* Adjust based on your table structure *)
;;

(* Function to write a note to the database *)
let write_note text (module Db : DB) =
  let%lwt unit_or_error = Db.exec update_note_query text in
  Caqti_lwt.or_fail unit_or_error
;;

let write_to_file filename content =
  Lwt_io.with_file ~mode:Lwt_io.Output filename (fun oc -> Lwt_io.write oc content)
;;

let read_from_file filename = Lwt_io.with_file ~mode:Lwt_io.Input filename Lwt_io.read

let unique =
  let last = ref 0 in
  fun () ->
    incr last;
    !last
;;

let () = Dream.initialize_log ~level:`Debug ()

let layout contents =
  let open Dream_html in
  let open HTML in
  html
    [ lang "en" ]
    [ head
        []
        [ title [] "Dream-html"
        ; meta [ name "viewport"; content "width=device-width, initial-scale=1" ]
        ; meta
            [ name "apple-mobile-web-app-status-bar-style"; content "black-translucent" ]
        ; meta [ name "apple-mobile-web-app-title"; content "NT" ]
        ; meta [ name "apple-mobile-web-app-capable"; content "yes" ]
        ; script [ src "https://unpkg.com/htmx.org@1.9.4" ] ""
        ; script [ src "https://unpkg.com/htmx.org/dist/ext/ws.js" ] ""
        ; script [ src "https://unpkg.com/idiomorph/dist/idiomorph-ext.min.js" ] ""
        ; script [ src "https://unpkg.com/alpinejs"; defer ] ""
        ; script [ src "https://cdn.tailwindcss.com" ] ""
        ; script
            []
            "\n\
            \        \n\
            \        document.addEventListener('visibilitychange', function() {\n\n\
            \        let element = document.body;\n\
            \        if(element) {\n\
            \            element.dispatchEvent(new Event('visibilitychangeevent'));\n\
            \        }\n\
             });\n\
            \        \n\
            \        "
        ; link
            [ href
                "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;1,100;1,200;1,300;1,400;1,500&family=Inter:wght@300;400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
            ; rel "stylesheet"
            ]
        ; style
            []
            "\n\
            \              @font-face {\n\
            \            font-family: 'BerkeleyMono';\n\
            \            src: \n\
            \                 url('/static/BerkeleyMono-Regular.woff') format('woff'); \
             /* WOFF file for web use */\n\
            \        }\n\n\
            \        body {\n\
            \            font-family: 'BerkeleyMono', sans-serif; /* Fallback to \
             sans-serif if custom font fails */\n\
            \        }\n\
            \            \n\
            \      \n\n\
            \           \n\
            \             textarea {\n\
            \    border: none;\n\
            \    overflow: auto;\n\
            \    outline: none;\n\n\
            \    -webkit-box-shadow: none;\n\
            \    -moz-box-shadow: none;\n\
            \    box-shadow: none;\n\n\
            \    resize: none; /*remove the resize handle on the bottom right*/\n\
             }\n\n\n"
        ]
    ; body
        [ Hx.ext "morph"
        ; Hx.boost true
        ; Hx.get "/"
        ; Hx.trigger "visibilitychangeevent"
        ; class_ "bg-black text-white uppercase"
        ]
        [ contents ]
    ]
;;

let note_routes =
  let note_text : string ref = ref "" in
  let note request =
    let _ =
      (* let%lwt bytes = read_from_file "note.txt" in
         note_text := bytes;
         Lwt.return_unit *)
      let%lwt bytes = Dream.sql request read_note in
      note_text := bytes;
      Lwt.return_unit
    in
    let open Dream_html in
    let open HTML in
    div
      [ id "form" ]
      [ form
          [ Hx.post "/notes/edit"; Hx.trigger "keyup delay:0.5s"; Hx.swap "none" ]
          [ txt ~raw:true "%s" (Dream.csrf_tag request)
          ; textarea
              [ name "text"
              ; spellcheck false
              ; class_ "bg-black w-screen h-[80vh] p-2 border-0 outline-0 ring-0"
              ]
              "%s"
              !note_text
          ]
      ]
  in
  ( Dream.scope
      "/notes"
      []
      [ Dream.post "/get" (fun request -> note request |> Dream_html.respond)
      ; Dream.post "/edit" (fun request ->
          match%lwt Dream.form request with
          | `Ok [ ("text", text) ] ->
            note_text := text;
            let _ = write_to_file "note.txt" !note_text in
            let _ = Dream.sql request (write_note text) in
            note request |> Dream_html.respond
          | _ -> Dream.empty `Bad_Request)
      ]
  , note )
;;

let get_port () =
  match Sys.getenv_opt "PORT" with
  | Some port_string ->
    (try int_of_string port_string with
     | Failure _ ->
       Printf.eprintf "Warning: Invalid PORT value, defaulting to 8080.\n";
       8080)
  | None ->
    Printf.eprintf "Warning: PORT environment variable not set, defaulting to 8080.\n";
    8080
;;

let () =
  let open Dotenv in
  (* Load environment variables from .env file *)
  Dotenv.export ();
  (* Retrieve the database URL from environment variables *)
  let db_url =
    match Sys.getenv_opt "DATABASE_URL" with
    | Some url -> url
    | None -> failwith "DATABASE_URL not set in .env file"
  in
  let routes, note = note_routes in
  Dream.run ~interface:"0.0.0.0" ~port:(get_port ())
  @@ Dream.logger
  (* @@ Livereload.livereload *)
  @@ Dream.sql_pool db_url (* Use the loaded database URL *)
  @@ Dream.memory_sessions
  @@ Dream.router
       [ Dream.get "/" (fun request ->
           let page = layout @@ note request |> Dream_html.respond in
           page)
       ; routes
       ; Dream.get "/static/**" @@ Dream.static "./static"
       ]
;;
