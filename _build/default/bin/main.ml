type todo =
  { text : string
  ; done_ : bool
  ; user : string
  ; id : int
  }

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
        ; meta [name "viewport"; content "width=device-width, initial-scale=1"]
        ; meta [name "apple-mobile-web-app-status-bar-style"; content "black-translucent"]
        ; meta [name "apple-mobile-web-app-title"; content "NT"]
        ; meta [name "apple-mobile-web-app-capable"; content "yes"]

        ; script [ src "https://unpkg.com/htmx.org@1.9.4" ] ""
        ; script [ src "https://unpkg.com/htmx.org/dist/ext/ws.js" ] ""
        ; script [ src "https://unpkg.com/idiomorph/dist/idiomorph-ext.min.js" ] ""
        ; script [ src "https://unpkg.com/alpinejs"; defer ] ""
        ; script [ src "https://cdn.tailwindcss.com" ] ""
        ; script [] "
        
        document.addEventListener('visibilitychange', function() {

        let element = document.body;
        if(element) {
            element.dispatchEvent(new Event('visibilitychangeevent'));
        }
});
        
        "
        ; link
            [ href
                "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;1,100;1,200;1,300;1,400;1,500&family=Inter:wght@300;400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
            ; rel "stylesheet"
            ]
        ; style
            []
            "body, input {\n\
            \    font-family: Helvetica, sans-serif;\n\
            \    font-size: 24px;\n\
            \    \n\
            \  }\n\
            \  .fade-me-out.htmx-swapping {\n\
            \  opacity: 0;\n\
            \  transition: opacity 1s ease-out;\n\
             }\n\n\
             #fade-me-in.htmx-added {\n\
            \  opacity: 0;\n\
             }\n\
             #fade-me-in {\n\
            \  opacity: 1;\n\
            \  transition: opacity 1s ease-out;\n\
             }\n\n\
             textarea {\n\
            \    border: none;\n\
            \    overflow: auto;\n\
            \    outline: none;\n\n\
            \    -webkit-box-shadow: none;\n\
            \    -moz-box-shadow: none;\n\
            \    box-shadow: none;\n\n\
            \    resize: none; /*remove the resize handle on the bottom right*/\n\
             }\n\n\n\
             body{\n\
            \  font-family: 'Space Mono', sans-serif;\n\
             }\n"
        ]
    ; body
        [ Hx.ext "morph"; Hx.boost true; Hx.get "/"; Hx.trigger "visibilitychangeevent"; class_ "bg-black text-white uppercase" ]
        [ contents ]  
    ]
;;

let websockets = ref []
let _ = Random.self_init (); (* Initialize the generator *) 


let note_routes =
  let note_text : string ref = ref "" in
  let broadcast_update sender_id update =
  List.iter (fun (id, ws) ->
    if id <> sender_id then
      (* Send the update to each connected client except the sender *)
      Lwt.async (fun () -> Dream.send ws (update))
  ) !websockets in
  let rec ws_handler ws = 
  
  let id = Random.int 10000 in
  websockets := (id, ws) :: !websockets;
  Lwt.return_unit
  in
  let note request =
    let _ =
      match !note_text with
      | "" ->
        let%lwt bytes = read_from_file "note.txt" in
        note_text := bytes;
        Lwt.return_unit
      | _ -> Lwt.return_unit
    in
    
    let open Dream_html in
    let open HTML in
    div [Hx.ext "ws"; Hx.ws_connect "/notes/websocket"; Hx.swap "outerHTML"] [form
      [ Hx.post "/notes/edit"; Hx.trigger "keyup delay:0.5s"; Hx.swap "none" ]
      [ txt ~raw:true "%s" (Dream.csrf_tag request)
      ; textarea
          [ name "text"
          ; spellcheck false
          ; class_ "bg-black w-screen h-[80vh] p-2 border-0 outline-0 ring-0"
          ]
          "%s"
          !note_text
      ]]
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
            let _ = broadcast_update 0 !note_text in
            note request |> Dream_html.respond
          | _ -> Dream.empty `Bad_Request)
      ; Dream.get "/websocket" (fun _ -> Dream.websocket ws_handler);
      ]
  , note )
;;

let get_port () =
  match Sys.getenv_opt "PORT" with
  | Some port_string -> (
      try int_of_string port_string
      with Failure _ ->
        Printf.eprintf "Warning: Invalid PORT value, defaulting to 8080.\n";
        8080)
  | None ->
      Printf.eprintf
        "Warning: PORT environment variable not set, defaulting to 8080.\n";
      8080

let () =
  let routes, note = note_routes in
  Dream.run ~interface:"0.0.0.0" ~port:(get_port ())
  @@ Dream.logger
  (* @@ Livereload.livereload *)
  @@ Dream.memory_sessions
  @@ Dream.router
       [ Dream.get "/" (fun request ->
           let page = layout @@ note request |> Dream_html.respond in
           page)
       ; routes
       ]
;;
