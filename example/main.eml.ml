(* This example provides a small forum application where anyone with GitHub,
   Stackoverflow or Twitch account can post to. *)

type todo = {
  text : string;
  done_ : bool;
  user: string;
  id: int
}



let write_to_file filename content =
  Lwt_io.with_file ~mode:Lwt_io.Output filename (fun oc ->
      Lwt_io.write oc content
  )


let read_from_file filename =
  Lwt_io.with_file ~mode:Lwt_io.Input filename Lwt_io.read


let unique = 
  let last = ref 0 in 
  fun () -> incr last ; !last





(* First we configure OAuth2 providers for GitHub, Stackoverflow and Twitch
   respectively. *)

let () = Dream.initialize_log ~level:`Debug ()

let github =
  Dream_oauth.Github.make
    ~client_id:("e085aae034941d8fbdb4")
    ~client_secret:("59e402e68e977366fe06bdc3470f44e5829c073b")
    ~redirect_uri:("https://localhost:8080/oauth2/callback/github")

(* let stackoverflow =
  Dream_oauth.Stackoverflow.make
    ~client_id:(Sys.getenv "SO_CLIENT_ID")
    ~client_secret:(Sys.getenv "SO_CLIENT_SECRET")
    ~redirect_uri:(Sys.getenv "SO_REDIRECT_URI")
    ~key:(Sys.getenv "SO_KEY")

let twitch =
  Dream_oauth.Twitch.make
    ~client_id:(Sys.getenv "TWITCH_CLIENT_ID")
    ~client_secret:(Sys.getenv "TWITCH_CLIENT_SECRET")
    ~redirect_uri:(Sys.getenv "TWITCH_REDIRECT_URI")

let google = Dream_oidc.google
  ~client_id:(Sys.getenv "GOOGLE_CLIENT_ID")
  ~client_secret:(Sys.getenv "GOOGLE_CLIENT_SECRET")
  ~redirect_uri:(Sys.getenv "GOOGLE_REDIRECT_URI")
  ()

let microsoft = Dream_oidc.microsoft
  ~client_id:(Sys.getenv "MS_CLIENT_ID")
  ~client_secret:(Sys.getenv "MS_CLIENT_SECRET")
  ~redirect_uri:(Sys.getenv "MS_REDIRECT_URI")
  ()

(* XXX: See https://github.com/aantron/hyper/issues/5 *)
(* let gitlab = Dream_oidc.make *)
(*   ~client_id:(Sys.getenv "GITLAB_CLIENT_ID") *)
(*   ~client_secret:(Sys.getenv "GITLAB_CLIENT_SECRET") *)
(*   ~redirect_uri:(Sys.getenv "GITLAB_REDIRECT_URI") *)
(*   "https://gitlab.com" *)

let twitch_oidc = Dream_oidc.twitch
  ~client_id:(Sys.getenv "TWITCH_CLIENT_ID")
  ~client_secret:(Sys.getenv "TWITCH_CLIENT_SECRET")
  ~redirect_uri:(Sys.getenv "TWITCH_OIDC_REDIRECT_URI")
  () *)

(* Now provide functions to signin, signout and query current user (if any) from
   the request.

   In this example we store only the display name with provider (which user
   originated from) in the session. In the real application you'd probably want
   to persist [User_profile.t] information in the database and only store user
   identifier in the session. *)

let signin user request =
  let user =
    Option.value user.Dream_oidc.User_profile.name ~default:user.id
  in
  Dream.set_session_field request "user" user

let signout request =
  Dream.set_session_field request "user" ""

let user request =
  match Dream.session_field request "user" with
  | Some "" | None -> Some "ajit283"
  | Some v -> Some v

(* Our small forum application has a single page only.

   Note how we use `authorize_url` functions to generate
   links to start the sign in flow with each of the OAuth2 providers we have
   configured. *)

let layout contents =
  let open Dream_html in
  let open HTML in
  html
    [ lang "en" ]
    [
      head []
        [
          title [] "Dream-html";
          script [ src "https://unpkg.com/htmx.org@1.9.4" ] "";
          script [ src "https://unpkg.com/htmx.org/dist/ext/ws.js" ] "";
          script [ src "https://unpkg.com/idiomorph/dist/idiomorph-ext.min.js" ] "";
          script [ src "https://unpkg.com/alpinejs"; defer ] "";
          script [ src "https://cdn.tailwindcss.com" ] "";
          link [href "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;1,100;1,200;1,300;1,400;1,500&family=Inter:wght@300;400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"; rel "stylesheet"];
          style [] "body, input {
    font-family: Helvetica, sans-serif;
    font-size: 24px;
    
  }
  .fade-me-out.htmx-swapping {
  opacity: 0;
  transition: opacity 1s ease-out;
}

#fade-me-in.htmx-added {
  opacity: 0;
}
#fade-me-in {
  opacity: 1;
  transition: opacity 1s ease-out;
}

textarea {
    border: none;
    overflow: auto;
    outline: none;

    -webkit-box-shadow: none;
    -moz-box-shadow: none;
    box-shadow: none;

    resize: none; /*remove the resize handle on the bottom right*/
}


body{
  font-family: 'Space Mono', sans-serif;
}
"
        ];
      body [Hx.ext "morph"; Hx.boost true; class_ "bg-black text-white uppercase"] [ contents ];
    ]

let note_text : string ref = ref ""



let note request (nt : string) = let open Dream_html in let open HTML in form [Hx.post "/notes/edit"; Hx.trigger "keyup delay:0.5s"; Hx.swap "none"] [ txt ~raw:true "%s" (Dream.csrf_tag request); textarea [name "text"; spellcheck false; class_ "bg-black w-screen h-[80vh] p-2 border-0 outline-0 ring-0"] "%s" nt ]

let note_routes = Dream.scope "/notes" [] [

      Dream.post "/get" (fun request ->
      (* let _ = print_endline (Dream.param request "l") in *)
      
      match user request with
      | Some "ajit283" ->
        note request !note_text |> Dream_html.respond;
      | _ ->
        Dream.redirect request "/"
        
    );

    
    Dream.post "/edit" (fun request ->
      (* let _ = print_endline (Dream.param request "l") in *)
      
      match user request with
      | Some "ajit283" ->
        begin match%lwt Dream.form request with
        | `Ok ["text", text] -> note_text := text; let _ = write_to_file "note.txt" !note_text in note request !note_text |> Dream_html.respond;
        | _ -> Dream.empty `Bad_Request end
      | _ ->
        Dream.redirect request "/"
        
    );

    ]



let render request =

  let open Dream_html in
  let open HTML in
  Lwt.return @@
  Dream_html.to_string @@
  layout @@
  match user request with
  | None ->
      p [] [
        p [] [ txt "Please sign in to chat!"];
        p [] [a [href "%s" (Dream_oauth.Github.authorize_url github request)] [txt "Sign in with GitHub"]];
        hr []
      ] 

  | Some "ajit283" ->
      div [class_ "p-2"] [
        p [] [txt "Signed in as %s." "ajit283"];
        form [method_ `POST; action "/signout"] 
        [
          txt ~raw:true "%s" (Dream.csrf_tag request);
          input [type_ "submit"; value "Sign out"]
        ];
        hr []  ;
        
        note request !note_text
      ]
  | _ -> p [] [txt "only ajit can use this"]
      

  

(* Now we define [authenticate_handler] which creates a new oauth/oidc callback
   endpoint for the specified [path].

   The logic which handles the result of [authenticate request] function call is
   application specific.
   *)

let authenticate_handler path authenticate =
  Dream.get path (fun request ->
    match%lwt authenticate request with
    | `Ok user_profile ->
      let%lwt () = signin user_profile request in
      Dream.redirect request "/"
    | `Error message ->
      Dream.respond ~status:`Unauthorized message
    | `Provider_error (error, description) ->
      let message =
        Dream_oauth.provider_error_to_string error ^
        (description
        |> Option.map (fun description -> ": " ^ description)
        |> Option.value ~default:"")
      in
      Dream.respond ~status:`Unauthorized message
    | `Expired ->
      Dream.redirect request "/"
  )

let () =
  (* let () = *)
    (* Configure OIDC providers at startup. *)
    (* Lwt_main.run @@ *)
      (* Lwt_list.iter_p
        (fun oidc ->
          match%lwt Dream_oidc.configure oidc with
          | Ok () -> Lwt.return ()
          | Error err ->
            let provider_uri = Dream_oidc.provider_uri oidc in
            Printf.eprintf
              "error configuring OIDC client for %s: %s"
              provider_uri err;
            Lwt.return ()
        )
        [google; microsoft; twitch_oidc] *)
  (* in *)
  Dream.run ~tls: true
  @@ Dream.logger
  (* @@ Livereload.livereload *)
  @@ Dream.memory_sessions
  @@ Dream.router [

    authenticate_handler "/oauth2/callback/github" (
      Dream_oauth.Github.authenticate github);
    (* authenticate_handler "/oauth2/callback/stackoverflow" (
      Dream_oauth.Stackoverflow.authenticate stackoverflow);
    authenticate_handler "/oauth2/callback/twitch" (
      Dream_oauth.Twitch.authenticate twitch);

    authenticate_handler "/oidc/callback/google" (
      Dream_oidc.authenticate google);
    authenticate_handler "/oidc/callback/twitch" (
      Dream_oidc.authenticate twitch_oidc);
    authenticate_handler "/oidc/callback/microsoft" (
      Dream_oidc.authenticate microsoft); *)

    Dream.get "/" (fun request ->
      let%lwt bytes = read_from_file "note.txt" in
      note_text := bytes;
      let%lwt page = render request in
      Dream.html page);

   

    note_routes;

    Dream.post "/signout" (fun request ->
      match%lwt Dream.form request with
      | `Ok _ ->
        let%lwt () = signout request in
        Dream.redirect request "/"
      | `Expired _ | `Wrong_session _ ->
        Dream.redirect request "/"
      | `Invalid_token _
      | `Missing_token _
      | `Many_tokens _
      | `Wrong_content_type ->
        Dream.respond ~status:`Unauthorized "Failed to sign-out"
    );

    
  ]
